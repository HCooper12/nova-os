// THE GYM — the equipment the figure actually uses, built rather than modelled.
//
// Hayden, 9 Sep 2026: "Cable equipment should also be included in the 3-D view
// such as a cable stack, pulley, or any other relevant equipment that matches
// the exercise such as a lat pulldown, pull up bar, different types of
// barbells, etc." Before this the whole gym was one barbell, one dumbbell, one
// bench and a post standing in for every cable machine — so a lat pulldown
// showed a man reaching at nothing, and a cable lateral raise handed him
// dumbbells.
//
// Everything here is primitives. That is a deliberate choice, not a shortcut:
// a bar Nova draws from a cylinder and two plates is a bar Nova can place
// exactly in his hands and move with them, which a downloaded mesh is not. The
// budget goes on the things that carry meaning — where the load sits, which
// way the cable runs, what the body is braced against.
//
// One rule throughout: the pulley is where the resistance comes FROM, and the
// cable has to be seen running from it to the hands. A cable machine with a
// static rope is just furniture.

import * as THREE from 'three';

const STEEL = 0x9aa3b4;
const FRAME = 0x39415a;
const IRON = 0x2c3242;
const UPHOLSTERY = 0x232a3c;

export function metal(color = STEEL, rough = 0.35) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.75 });
}

function soft(color = UPHOLSTERY) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.05 });
}

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function tube(r, len, mat, axis = 'y') {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), mat);
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  return m;
}

/* --------------------------------- bars ---------------------------------- */

function plates(g, len, count = 2, r = 0.225) {
  for (const side of [-1, 1]) {
    for (let i = 0; i < count; i++) {
      const p = tube(r - i * 0.012, 0.035, metal(IRON, 0.6), 'x');
      p.position.x = side * (len / 2 - 0.10 - i * 0.045);
      g.add(p);
    }
  }
}

export function barbell(len = 1.9) {
  const g = new THREE.Group();
  g.add(tube(0.014, len, metal(), 'x'));
  plates(g, len);
  return g;
}

// An EZ bar's whole point is the camber: the wrists sit half supinated, which is
// why it exists and why drawing a straight bar for a preacher curl is wrong.
export function ezBar() {
  const g = new THREE.Group();
  const pts = [];
  const L = 1.2;
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const x = -L / 2 + t * L;
    // two shallow humps through the grips, flat at the sleeves
    const bend = Math.abs(x) < 0.34 ? Math.sin(x / 0.34 * Math.PI * 2) * 0.030 : 0;
    pts.push(new THREE.Vector3(x, bend, 0));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.014, 8, false), metal()));
  plates(g, L, 2, 0.155);
  return g;
}

// A trap bar is a frame you stand INSIDE — the load sits either side of the
// body rather than in front of it, which is the entire difference from a
// deadlift and has to be visible.
export function trapBar() {
  const g = new THREE.Group();
  const w = 0.62; const d = 0.78;
  for (const s of [-1, 1]) {
    const rail = tube(0.020, d, metal(), 'z');
    rail.position.x = s * w / 2;
    g.add(rail);
  }
  for (const z of [-d / 2, d / 2]) {
    const bar = tube(0.020, w, metal(), 'x');
    bar.position.z = z;
    g.add(bar);
  }
  for (const s of [-1, 1]) {
    const handle = tube(0.016, 0.16, metal(), 'z');
    handle.position.set(s * w / 2, 0.055, 0);
    g.add(handle);
    const post = tube(0.020, 0.11, metal(), 'y');
    post.position.set(s * w / 2, 0.055, 0);
    g.add(post);
    for (let i = 0; i < 2; i++) {
      const p = tube(0.225 - i * 0.012, 0.035, metal(IRON, 0.6), 'z');
      p.position.set(s * (w / 2 + 0.09), 0, 0.22 + i * 0.045);
      g.add(p);
      const p2 = p.clone();
      p2.position.z = -(0.22 + i * 0.045);
      g.add(p2);
    }
  }
  return g;
}

export function dumbbell() {
  const g = new THREE.Group();
  g.add(tube(0.017, 0.16, metal(), 'x'));
  for (const s of [-1, 1]) {
    const head = tube(0.062, 0.085, metal(IRON, 0.6), 'x');
    head.position.x = s * 0.105;
    g.add(head);
  }
  return g;
}

/* ------------------------------- attachments ------------------------------ */

export function straightAttachment(len = 0.62) {
  const g = new THREE.Group();
  g.add(tube(0.013, len, metal(), 'x'));
  for (const s of [-1, 1]) {
    const end = tube(0.013, 0.10, metal(), 'y');
    end.position.set(s * len / 2, 0.045, 0);
    end.rotation.z = s * 0.5;
    g.add(end);
  }
  return g;
}

export function latBar(len = 1.10) {
  // the wide bar: swept ends are what make a pulldown grip wider than shoulders
  const g = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 30; i++) {
    const t = i / 30;
    const x = -len / 2 + t * len;
    const k = Math.max(0, Math.abs(x) - len * 0.28) / (len * 0.22);
    pts.push(new THREE.Vector3(x, -k * k * 0.13, 0));
  }
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.013, 8, false), metal()));
  return g;
}

export function ropeAttachment() {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const r = tube(0.010, 0.30, soft(0x6b6f7d), 'y');
    r.position.set(s * 0.035, -0.14, 0);
    r.rotation.z = -s * 0.16;
    g.add(r);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.020, 10, 8), soft(0x4a4e5c));
    knob.position.set(s * 0.058, -0.29, 0);
    g.add(knob);
  }
  return g;
}

export function dHandle() {
  const g = new THREE.Group();
  g.add(tube(0.013, 0.13, metal(), 'x'));
  const yoke = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 8, 18, Math.PI), metal());
  yoke.rotation.x = Math.PI / 2;
  yoke.position.y = 0.005;
  g.add(yoke);
  return g;
}

/* -------------------------------- stations -------------------------------- */

export function bench(angleDeg = 0) {
  const g = new THREE.Group();
  const p = box(0.32, 0.07, 1.15, soft());
  p.rotation.x = -THREE.MathUtils.degToRad(angleDeg);
  p.position.y = 0.45;
  g.add(p);
  for (const z of [-0.45, 0.45]) g.add(box(0.26, 0.42, 0.05, metal(FRAME, 0.7), 0, 0.21, z));
  return g;
}

// A weight stack, a pulley you can see turning, and the anchor the cable runs
// from. `anchorY` is where the cable leaves the machine — high for a pulldown,
// low for a curl, mid for a chest fly.
export function cableStation(anchorY = 2.05, { stackHeight = 0.75 } = {}) {
  const g = new THREE.Group();
  g.add(box(0.10, 2.20, 0.10, metal(FRAME, 0.7), 0, 1.10, -0.05));
  g.add(box(0.10, 2.20, 0.10, metal(FRAME, 0.7), 0, 1.10, 0.16));
  g.add(box(0.34, 0.06, 0.34, metal(FRAME, 0.7), 0, 0.03, 0.055));
  // the stack, as visible plates — a weight stack that is one grey box reads
  // as a filing cabinet
  const n = 10;
  for (let i = 0; i < n; i++) {
    const plate = box(0.22, stackHeight / n - 0.008, 0.17, metal(IRON, 0.55),
      0, 0.10 + i * (stackHeight / n), 0.055);
    g.add(plate);
  }
  const rod = tube(0.010, stackHeight + 0.30, metal(), 'y');
  rod.position.set(0, 0.10 + stackHeight * 0.6, 0.055);
  g.add(rod);

  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.014, 8, 20), metal(0xb9c0cd, 0.3));
  wheel.rotation.y = Math.PI / 2;
  wheel.position.set(0, anchorY, 0.055);
  g.add(wheel);
  g.add(box(0.05, 0.10, 0.02, metal(FRAME, 0.6), 0, anchorY + 0.055, 0.055));
  g.userData.anchor = new THREE.Vector3(0, anchorY - 0.055, 0.055);
  g.userData.wheel = wheel;
  return g;
}

export function latPulldown() {
  const g = new THREE.Group();
  const st = cableStation(2.10);
  g.add(st);
  g.userData.anchor = st.userData.anchor;
  g.userData.wheel = st.userData.wheel;
  // seat and thigh pad — the bit that stops a pulldown lifting the lifter
  g.add(box(0.34, 0.08, 0.36, soft(), 0, 0.50, 0.62));
  for (const x of [-0.13, 0.13]) g.add(box(0.05, 0.46, 0.05, metal(FRAME, 0.7), x, 0.27, 0.62));
  g.add(box(0.30, 0.09, 0.13, soft(), 0, 0.76, 0.44));
  g.add(box(0.05, 0.28, 0.05, metal(FRAME, 0.7), 0, 0.63, 0.44));
  return g;
}

export function pullupRig() {
  const g = new THREE.Group();
  const bar = tube(0.018, 1.24, metal(), 'x');
  bar.position.y = 2.24;
  g.add(bar);
  for (const s of [-1, 1]) {
    g.add(box(0.07, 2.24, 0.07, metal(FRAME, 0.7), s * 0.62, 1.12, 0));
    g.add(box(0.16, 0.05, 0.46, metal(FRAME, 0.7), s * 0.62, 0.025, 0));
  }
  g.userData.bar = bar;
  return g;
}

// The three leg machines share a frame and differ in where the pad is and
// which way the arm swings — which is the only part that teaches anything.
function legFrame() {
  const g = new THREE.Group();
  g.add(box(0.36, 0.09, 0.42, soft(), 0, 0.46, 0.10));
  for (const x of [-0.14, 0.14]) g.add(box(0.05, 0.44, 0.05, metal(FRAME, 0.7), x, 0.24, 0.10));
  g.add(box(0.34, 0.44, 0.08, soft(), 0, 0.70, 0.32));
  return g;
}

export function legExtension() {
  const g = legFrame();
  const arm = new THREE.Group();
  arm.add(tube(0.024, 0.34, metal(), 'x'));
  const roller = tube(0.055, 0.30, soft(0x2e3550), 'x');
  roller.position.z = -0.30;
  arm.add(roller);
  const shaftE = tube(0.020, 0.30, metal(), 'z');
  shaftE.position.z = -0.15;
  arm.add(shaftE);
  arm.position.set(0, 0.44, -0.16);
  g.add(arm);
  g.userData.arm = arm;
  return g;
}

export function legCurl() {
  const g = legFrame();
  const arm = new THREE.Group();
  const roller = tube(0.055, 0.30, soft(0x2e3550), 'x');
  roller.position.z = 0.30;
  arm.add(roller);
  const shaftC = tube(0.020, 0.30, metal(), 'z');
  shaftC.position.z = 0.15;
  arm.add(shaftC);
  arm.position.set(0, 0.36, -0.28);
  g.add(arm);
  g.userData.arm = arm;
  return g;
}

export function legPress() {
  const g = new THREE.Group();
  const seat = box(0.36, 0.09, 0.50, soft(), 0, 0.36, 0.30);
  g.add(seat);
  const back = box(0.36, 0.52, 0.09, soft(), 0, 0.60, 0.56);
  back.rotation.x = THREE.MathUtils.degToRad(-38);
  g.add(back);
  for (const x of [-0.16, 0.16]) g.add(box(0.05, 1.60, 0.05, metal(FRAME, 0.7), x, 0.80, -0.55));
  const sled = box(0.60, 0.60, 0.08, metal(FRAME, 0.6), 0, 0.78, -0.52);
  sled.rotation.x = THREE.MathUtils.degToRad(-38);
  g.add(sled);
  for (const s of [-1, 1]) {
    const p = tube(0.20, 0.035, metal(IRON, 0.6), 'x');
    p.position.set(s * 0.40, 0.78, -0.52);
    g.add(p);
  }
  g.userData.sled = sled;
  return g;
}

export function smithRack() {
  const g = new THREE.Group();
  for (const s of [-1, 1]) g.add(box(0.08, 2.20, 0.08, metal(FRAME, 0.7), s * 0.72, 1.10, -0.30));
  g.add(box(1.52, 0.06, 0.06, metal(FRAME, 0.7), 0, 2.18, -0.30));
  return g;
}

/* --------------------------------- cable ---------------------------------- */

// A cable that actually runs from the pulley to the hands, and is re-aimed
// every frame. This is the difference between a cable machine and a post.
export function cable() {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 6), metal(0x76808f, 0.5));
  m.geometry.translate(0, 0.5, 0);          // grow from the anchor end
  m.userData.isCable = true;
  return m;
}

export function aimCable(mesh, from, to) {
  const v = to.clone().sub(from);
  const len = v.length();
  if (!(len > 1e-5)) return;
  mesh.position.copy(from);
  mesh.scale.set(1, len, 1);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
}
