// THE GYM — the equipment the figure actually uses, at the dimensions it
// actually has.
//
// Hayden, 9 Sep 2026: "ensure that the equipment in all exercises is also
// exceptionally detailed and realistically accurate."
//
// The first version was a cylinder with two discs on it. That is a barbell in
// the way a stick figure is a person: right topology, no truth. What was
// missing was not polygons — it was MEASUREMENTS and the parts that carry
// meaning. An Olympic bar is 2.20 m long and 20 kg; its shaft is 28 mm and its
// sleeves are 50 mm, which is why plates fit one and hands fit the other. It
// has knurling where you hold it and none where you do not, a collar where the
// sleeve steps out, and a snap clip holding the plates on. Competition bumper
// plates are all 450 mm across whatever they weigh — that is the whole point of
// them, so the bar sits at the same height off the floor every time — and they
// are colour-coded: red 25, blue 20, yellow 15, green 10.
//
// Every number below is a real one. Where a real machine has a part that does
// something — a selector pin, a J-hook, a thigh pad, a pulley housing — it is
// here, because those are the parts a lifter reads to know what they are
// looking at.
//
// Still built rather than modelled, and deliberately: a bar Nova draws from
// primitives is a bar Nova can place exactly in his hands and move with them,
// which a downloaded mesh is not.

import * as THREE from 'three';

/* -------------------------------- materials ------------------------------- */

const CHROME = 0xc9cfd8;      // sleeves, guide rods
const KNURL = 0x8b929c;       // the grip: darker, and rough where it is cut
const IRON = 0x2b2f38;        // cast plates
const FRAME = 0x353c4e;       // powder-coated tube
const UPHOLSTERY = 0x1e2432;
const RUBBER = 0x23262c;

// bumper plates are colour-coded by weight the world over
const PLATE_COLOUR = { 25: 0x9d2b2b, 20: 0x21467e, 15: 0xb8991f, 10: 0x2c7a43, 5: 0xd8d8d8 };

export function metal(color = CHROME, rough = 0.28) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.85 });
}
const knurled = () => new THREE.MeshStandardMaterial({ color: KNURL, roughness: 0.72, metalness: 0.7 });
const iron = () => new THREE.MeshStandardMaterial({ color: IRON, roughness: 0.62, metalness: 0.35 });
const rubber = (c = RUBBER) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.94, metalness: 0.02 });
const powder = (c = FRAME) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.25 });
const pad = (c = UPHOLSTERY) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, metalness: 0.03 });

/* --------------------------------- helpers -------------------------------- */

function tube(r, len, mat, axis = 'y', seg = 20) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  return m;
}

function box(w, h, d, mat, x = 0, y = 0, z = 0, r = 0) {
  const g = r > 0 ? new THREE.BoxGeometry(w, h, d) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  return m;
}

// Knurling, as the rings of a cut diamond pattern. Modelled rather than
// textured because it is the one detail that tells you where a bar is meant to
// be held, and at this size a band of fine ridges reads better than a map.
function knurlBand(g, radius, from, to, mat) {
  const step = 0.009;
  for (let x = from; x <= to; x += step) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.0011, 4, 18), mat);
    ring.rotation.y = Math.PI / 2;
    ring.position.x = x;
    g.add(ring);
  }
}

/* ---------------------------------- bars ---------------------------------- */

// A competition bumper plate: same 450 mm across at every weight, coloured by
// it, with a steel hub and the recessed face a real one has.
function bumper(kg, mat) {
  const g = new THREE.Group();
  const R = 0.225;                       // 450 mm, the same for every weight
  const w = 0.022 + (kg / 25) * 0.052;   // heavier plates are thicker, not wider
  const col = PLATE_COLOUR[kg] || IRON;
  const body = tube(R, w, rubber(col), 'x', 32);
  g.add(body);
  // the recessed face, and the steel hub the sleeve passes through
  for (const s of [-1, 1]) {
    const face = tube(R * 0.72, 0.004, rubber(col), 'x', 28);
    face.position.x = s * (w / 2 + 0.001);
    face.material = rubber(col).clone();
    face.material.color.multiplyScalar(0.86);
    g.add(face);
  }
  g.add(tube(0.052, w + 0.006, metal(CHROME, 0.35), 'x', 20));
  g.add(tube(0.026, w + 0.008, metal(0x1a1d23, 0.6), 'x', 20));
  g.userData.width = w;
  return g;
}

/* An Olympic barbell, at the dimensions of one.
 *
 *   2.20 m overall · 28 mm shaft · 50 mm sleeves · 1.31 m between the collars
 *
 * Those three numbers are why a bar looks like a bar: the sleeves are visibly
 * fatter than the shaft, they step out at a collar, and the grip between them
 * is exactly a bit wider than a pair of shoulders.
 */
export function barbell(kgPerSide = 20, opts = {}) {
  const g = new THREE.Group();
  const SHAFT_R = 0.014;        // 28 mm
  const SLEEVE_R = 0.025;       // 50 mm
  const INNER = 1.31;           // collar to collar
  const SLEEVE = 0.415;
  const shaft = tube(SHAFT_R, INNER + 0.09, metal(KNURL, 0.5), 'x', 20);
  g.add(shaft);
  // knurl where the hands and the back go, and nowhere else
  knurlBand(g, SHAFT_R + 0.0012, -0.66, -0.30, knurled());
  knurlBand(g, SHAFT_R + 0.0012, 0.30, 0.66, knurled());
  if (opts.centreKnurl !== false) knurlBand(g, SHAFT_R + 0.0012, -0.06, 0.06, knurled());

  for (const s of [-1, 1]) {
    // the collar: the step from shaft to sleeve, and the ring that marks it
    const collar = tube(0.032, 0.020, metal(CHROME, 0.3), 'x', 20);
    collar.position.x = s * (INNER / 2 + 0.012);
    g.add(collar);
    const sleeve = tube(SLEEVE_R, SLEEVE, metal(CHROME, 0.24), 'x', 22);
    sleeve.position.x = s * (INNER / 2 + 0.022 + SLEEVE / 2);
    g.add(sleeve);
    // grooved rings near the collar, as a real sleeve has
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(SLEEVE_R + 0.0008, 0.0015, 6, 20), metal(0x9aa2ad, 0.4));
      ring.rotation.y = Math.PI / 2;
      ring.position.x = s * (INNER / 2 + 0.040 + i * 0.012);
      g.add(ring);
    }
    // plates, loaded outward in the order they actually go on
    let x = INNER / 2 + 0.034;
    for (const kg of platesFor(kgPerSide)) {
      const p = bumper(kg);
      x += p.userData.width / 2;
      p.position.x = s * x;
      g.add(p);
      x += p.userData.width / 2 + 0.002;
    }
    // and the snap clip holding them on
    const clip = tube(0.034, 0.030, metal(0x6f7885, 0.5), 'x', 16);
    clip.position.x = s * (x + 0.018);
    g.add(clip);
    const lever = box(0.010, 0.052, 0.012, metal(0x6f7885, 0.5), s * (x + 0.018), 0.030, 0);
    g.add(lever);
  }
  return g;
}

// Which plates make up a side — biggest first, the way anyone loads a bar.
function platesFor(kg) {
  const out = [];
  let left = Math.max(0, kg);
  for (const p of [25, 20, 15, 10, 5]) {
    while (left >= p - 0.01 && out.length < 5) { out.push(p); left -= p; }
  }
  return out.length ? out : [10];
}

// An EZ bar's whole point is the camber: the wrists sit half supinated, which
// is why it exists and why drawing a straight bar for a preacher curl is wrong.
export function ezBar() {
  const g = new THREE.Group();
  const L = 1.2;
  const pts = [];
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    const x = -L / 2 + t * L;
    const bend = Math.abs(x) < 0.34 ? Math.sin((x / 0.34) * Math.PI * 2) * 0.032 : 0;
    pts.push(new THREE.Vector3(x, bend, 0));
  }
  g.add(new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 56, 0.0145, 10, false), metal(KNURL, 0.5)));
  for (const s of [-1, 1]) {
    const sleeve = tube(0.025, 0.20, metal(CHROME, 0.26), 'x', 18);
    sleeve.position.x = s * (L / 2 + 0.10);
    g.add(sleeve);
    for (const kg of [10, 5]) {
      const p = bumper(kg);
      p.scale.setScalar(0.62);
      p.position.x = s * (L / 2 + 0.06 + (kg === 10 ? 0.02 : 0.06));
      g.add(p);
    }
  }
  return g;
}

// A trap bar is a frame you stand INSIDE — the load sits either side of the
// body rather than in front of it, which is the entire difference from a
// deadlift and has to be visible.
export function trapBar() {
  const g = new THREE.Group();
  const w = 0.66; const d = 0.86;
  for (const s of [-1, 1]) {
    const rail = tube(0.019, d, metal(FRAME, 0.5), 'z', 14);
    rail.position.x = s * w / 2;
    g.add(rail);
  }
  for (const z of [-d / 2, d / 2]) {
    const bar = tube(0.019, w, metal(FRAME, 0.5), 'x', 14);
    bar.position.z = z;
    g.add(bar);
  }
  for (const s of [-1, 1]) {
    const handle = tube(0.0155, 0.17, metal(KNURL, 0.6), 'z', 16);
    handle.position.set(s * w / 2, 0.075, 0);
    g.add(handle);
    knurlBand(g, 0.0165, -0.001, 0.001, knurled());
    const post = tube(0.017, 0.11, metal(FRAME, 0.5), 'y', 12);
    post.position.set(s * w / 2, 0.030, 0);
    g.add(post);
    for (const z of [-1, 1]) {
      const sleeve = tube(0.025, 0.26, metal(CHROME, 0.26), 'z', 16);
      sleeve.position.set(s * (w / 2), 0, z * (d / 2 + 0.13));
      g.add(sleeve);
      for (const kg of [20, 20]) {
        const p = bumper(kg);
        p.rotation.y = Math.PI / 2;
        p.position.set(s * (w / 2), 0, z * (d / 2 + 0.09 + (kg === 20 ? 0 : 0.06)));
        g.add(p);
      }
    }
  }
  return g;
}

// A hex dumbbell: flats so it does not roll, a knurled handle, and the fillet
// where the head meets it.
export function dumbbell(kg = 22) {
  const g = new THREE.Group();
  const R = 0.055 + (kg / 40) * 0.030;
  g.add(tube(0.0165, 0.145, metal(KNURL, 0.62), 'x', 16));
  knurlBand(g, 0.0175, -0.055, 0.055, knurled());
  for (const s of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.10, 6), rubber(0x2a2e36));
    head.rotation.z = Math.PI / 2;
    head.rotation.x = Math.PI / 6;
    head.position.x = s * 0.105;
    g.add(head);
    const collar = tube(0.024, 0.020, metal(0x6f7885, 0.5), 'x', 14);
    collar.position.x = s * 0.050;
    g.add(collar);
    const cap = tube(R * 0.34, 0.104, metal(0x4a5058, 0.5), 'x', 14);
    cap.position.x = s * 0.105;
    g.add(cap);
  }
  return g;
}

/* ------------------------------- attachments ------------------------------ */

export function straightAttachment(len = 0.62) {
  const g = new THREE.Group();
  g.add(tube(0.0135, len, metal(KNURL, 0.6), 'x', 16));
  knurlBand(g, 0.0145, -len / 2 + 0.03, len / 2 - 0.03, knurled());
  for (const s of [-1, 1]) {
    const end = tube(0.0135, 0.10, metal(FRAME, 0.5), 'y', 12);
    end.position.set(s * len / 2, 0.045, 0);
    end.rotation.z = s * 0.5;
    g.add(end);
  }
  // the welded eye the carabiner clips into
  const eye = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 8, 18), metal(0x8b929c, 0.4));
  eye.position.y = 0.030;
  g.add(eye);
  g.add(box(0.016, 0.040, 0.008, metal(0x8b929c, 0.4), 0, 0.012, 0));
  return g;
}

export function latBar(len = 1.10) {
  // the swept ends are what make a pulldown grip wider than shoulders
  const g = new THREE.Group();
  // one formula for the sweep, so the grips sit ON the bar rather than near it
  const sweep = (x) => {
    const k = Math.max(0, Math.abs(x) - len * 0.28) / (len * 0.22);
    return -k * k * 0.14;
  };
  const pts = [];
  for (let i = 0; i <= 34; i++) {
    const x = -len / 2 + (i / 34) * len;
    pts.push(new THREE.Vector3(x, sweep(x), 0));
  }
  g.add(new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 44, 0.0135, 10, false), metal(KNURL, 0.55)));
  // rubber grips at the hands and at the sweep, as every real one has
  for (const x of [-0.42, -0.20, 0.20, 0.42]) {
    const grip = tube(0.019, 0.13, rubber(0x1b1e24), 'x', 14);
    grip.position.set(x, sweep(x), 0);
    g.add(grip);
  }
  const eye = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.005, 8, 18), metal(0x8b929c, 0.4));
  eye.position.y = 0.028;
  g.add(eye);
  return g;
}

export function ropeAttachment() {
  const g = new THREE.Group();
  g.add(box(0.016, 0.045, 0.010, metal(0x8b929c, 0.45), 0, 0.020, 0));
  for (const s of [-1, 1]) {
    // a rope is braided and it hangs; a straight cylinder reads as a stick
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push(new THREE.Vector3(s * (0.012 + t * 0.055), -t * 0.30, t * t * 0.012));
    }
    g.add(new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.0105, 8, false), rubber(0x6b6f7d)));
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.021, 12, 10), rubber(0x3b3f49));
    knob.position.set(s * 0.068, -0.305, 0.012);
    g.add(knob);
  }
  return g;
}

export function dHandle() {
  const g = new THREE.Group();
  g.add(tube(0.014, 0.125, rubber(0x1b1e24), 'x', 14));
  const yoke = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.0075, 8, 22, Math.PI), metal(0x8b929c, 0.4));
  yoke.rotation.x = Math.PI / 2;
  yoke.position.y = 0.004;
  g.add(yoke);
  const eye = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0045, 8, 16), metal(0x8b929c, 0.4));
  eye.position.y = 0.062;
  g.add(eye);
  return g;
}

/* -------------------------------- stations -------------------------------- */

/* A bench, at bench dimensions: the pad is 1.22 m long, 300 mm wide and sits
 * 450 mm off the floor — the height is not arbitrary, it is what puts a
 * lifter's feet flat. An adjustable one has a gap between seat and back, and
 * a bench-press station has uprights with J-hooks.
 */
export function bench(angleDeg = 0, { uprights = false } = {}) {
  const g = new THREE.Group();
  const TOP = 0.45;
  const seatBack = () => {
    const back = box(0.30, 0.062, 0.74, pad());
    back.rotation.x = -THREE.MathUtils.degToRad(angleDeg);
    back.position.set(0, TOP + 0.031, angleDeg ? -0.28 : -0.24);
    g.add(back);
    // the stitched seam down the middle of a real pad
    const seam = box(0.008, 0.004, 0.70, pad(0x161b26));
    seam.rotation.x = back.rotation.x;
    seam.position.copy(back.position).y += 0.033;
    g.add(seam);
    const seat = box(0.30, 0.062, 0.40, pad(), 0, TOP + 0.031, angleDeg ? 0.20 : 0.30);
    g.add(seat);
  };
  seatBack();
  // frame: an A-leg at the head, a post at the foot, rubber feet
  g.add(box(0.06, TOP, 0.06, powder(), 0, TOP / 2, -0.52));
  g.add(box(0.34, 0.05, 0.06, powder(), 0, 0.025, -0.52));
  for (const s of [-1, 1]) {
    const leg = box(0.05, TOP, 0.05, powder());
    leg.position.set(s * 0.14, TOP / 2, 0.36);
    leg.rotation.z = -s * 0.10;
    g.add(leg);
  }
  g.add(box(0.36, 0.05, 0.06, powder(), 0, 0.025, 0.38));
  g.add(box(0.10, 0.05, 0.92, powder(), 0, TOP - 0.05, -0.06));

  if (uprights) {
    for (const s of [-1, 1]) {
      g.add(box(0.055, 1.14, 0.055, powder(), s * 0.56, 0.57, -0.42));
      g.add(box(0.055, 0.05, 0.42, powder(), s * 0.56, 0.025, -0.30));
      // the J-hook the bar rests in
      const hook = box(0.05, 0.10, 0.12, powder(0x2a3040), s * 0.50, 1.06, -0.42);
      g.add(hook);
      const lip = box(0.05, 0.11, 0.03, powder(0x2a3040), s * 0.50, 1.12, -0.36);
      g.add(lip);
    }
  }
  return g;
}

/* A cable station: the weight stack, the guide rods it slides on, the selector
 * pin, and a pulley you can see is a pulley. `anchorY` is where the cable
 * leaves the machine — high for a pulldown, low for a curl.
 */
export function cableStation(anchorY = 2.05, { stackHeight = 0.86, selected = 5 } = {}) {
  const g = new THREE.Group();
  const W = 0.30;
  // frame: two uprights and a top cross-member
  for (const z of [-0.10, 0.14]) g.add(box(0.075, 2.24, 0.075, powder(), 0, 1.12, z));
  g.add(box(0.075, 0.075, 0.30, powder(), 0, 2.20, 0.02));
  g.add(box(0.40, 0.055, 0.42, powder(), 0, 0.028, 0.02));

  // the stack itself: individual plates with a gap, on two guide rods
  const n = 12;
  const ph = stackHeight / n;
  for (let i = 0; i < n; i++) {
    const lifted = i >= n - selected;
    const plate = box(W, ph - 0.008, 0.19, iron(), 0, 0.10 + i * ph + (lifted ? 0.055 : 0), 0.02);
    g.add(plate);
    // the hole the pin goes through
    const hole = tube(0.010, 0.20, powder(0x14171d), 'z', 10);
    hole.position.set(0.055, plate.position.y, 0.02);
    g.add(hole);
  }
  for (const x of [-0.10, 0.10]) {
    const rod = tube(0.009, stackHeight + 0.42, metal(CHROME, 0.25), 'y', 12);
    rod.position.set(x, 0.10 + stackHeight * 0.55, 0.02);
    g.add(rod);
  }
  // the selector pin, in the plate that was chosen
  const pin = tube(0.008, 0.16, metal(0xb9c0cd, 0.3), 'z', 10);
  pin.position.set(0.055, 0.10 + (n - selected) * ph, 0.06);
  g.add(pin);
  g.add(box(0.030, 0.030, 0.014, rubber(0x8a2f2f), 0.055, pin.position.y, 0.14));
  // the top plate the cable pulls on
  g.add(box(W + 0.02, 0.05, 0.21, metal(0x4a5058, 0.5), 0, 0.10 + stackHeight + 0.055, 0.02));

  // the pulley: a wheel in a housing, not a floating ring
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.016, 10, 24), metal(0xb9c0cd, 0.3));
  wheel.rotation.y = Math.PI / 2;
  wheel.position.set(0, anchorY, 0.02);
  g.add(wheel);
  const hub = tube(0.014, 0.030, metal(0x6f7885, 0.45), 'x', 12);
  hub.position.copy(wheel.position);
  g.add(hub);
  for (const s of [-1, 1]) {
    g.add(box(0.010, 0.13, 0.10, powder(0x2a3040), s * 0.020, anchorY + 0.02, 0.02));
  }
  g.userData.anchor = new THREE.Vector3(0, anchorY - 0.055, 0.02);
  g.userData.wheel = wheel;
  return g;
}

export function latPulldown() {
  const g = new THREE.Group();
  const st = cableStation(2.12);
  g.add(st);
  g.userData.anchor = st.userData.anchor;
  g.userData.wheel = st.userData.wheel;
  // the seat, and the thigh pads that stop a pulldown lifting the lifter
  g.add(box(0.36, 0.075, 0.38, pad(), 0, 0.50, 0.64));
  g.add(box(0.30, 0.05, 0.34, powder(), 0, 0.455, 0.64));
  for (const x of [-0.13, 0.13]) g.add(box(0.05, 0.44, 0.05, powder(), x, 0.25, 0.64));
  g.add(box(0.34, 0.05, 0.34, powder(), 0, 0.028, 0.64));
  // thigh pad on an adjustable post
  g.add(box(0.05, 0.30, 0.05, powder(), 0, 0.64, 0.44));
  for (const x of [-0.11, 0.11]) {
    const roll = tube(0.055, 0.20, pad(0x232a3c), 'x', 14);
    roll.position.set(x, 0.79, 0.44);
    roll.rotation.z = Math.PI / 2;
    g.add(roll);
  }
  g.add(box(0.28, 0.05, 0.05, powder(), 0, 0.79, 0.44));
  return g;
}

export function pullupRig() {
  const g = new THREE.Group();
  const bar = tube(0.0165, 1.28, metal(KNURL, 0.55), 'x', 18);
  bar.position.y = 2.26;
  g.add(bar);
  knurlBand(g, 0.0175, -0.52, -0.16, knurled());
  knurlBand(g, 0.0175, 0.16, 0.52, knurled());
  for (const c of g.children) if (c.geometry?.type === 'TorusGeometry') c.position.y = 2.26;
  for (const s of [-1, 1]) {
    g.add(box(0.075, 2.26, 0.075, powder(), s * 0.64, 1.13, 0));
    g.add(box(0.20, 0.045, 0.52, powder(), s * 0.64, 0.022, 0));
    // the gusset where the upright meets the bar
    const gus = box(0.055, 0.14, 0.055, powder(0x2a3040), s * 0.60, 2.19, 0);
    gus.rotation.z = s * 0.5;
    g.add(gus);
  }
  g.userData.bar = bar;
  return g;
}

/* The three leg machines. They share a frame and differ in where the pad is
 * and which way the arm swings — which is the only part that teaches anything.
 */
function legFrame() {
  const g = new THREE.Group();
  g.add(box(0.38, 0.08, 0.44, pad(), 0, 0.46, 0.10));
  g.add(box(0.34, 0.05, 0.40, powder(), 0, 0.415, 0.10));
  for (const x of [-0.14, 0.14]) g.add(box(0.05, 0.42, 0.05, powder(), x, 0.21, 0.10));
  g.add(box(0.40, 0.05, 0.46, powder(), 0, 0.026, 0.10));
  const back = box(0.36, 0.46, 0.08, pad());
  back.rotation.x = THREE.MathUtils.degToRad(-8);
  back.position.set(0, 0.71, 0.33);
  g.add(back);
  g.add(box(0.06, 0.30, 0.05, powder(), 0, 0.60, 0.36));
  return g;
}

function roller(x, y, z, mat = pad(0x2e3550)) {
  const r = tube(0.058, 0.30, mat, 'x', 16);
  r.position.set(x, y, z);
  return r;
}

export function legExtension() {
  const g = legFrame();
  const arm = new THREE.Group();
  arm.add(tube(0.022, 0.34, powder(), 'x', 12));
  const shaft = tube(0.019, 0.32, powder(), 'z', 12);
  shaft.position.z = -0.16;
  arm.add(shaft);
  arm.add(roller(0, 0, -0.32));
  const link = tube(0.010, 0.30, metal(CHROME, 0.3), 'z', 10);
  link.position.z = -0.16;
  arm.add(link);
  arm.position.set(0, 0.44, -0.16);
  g.add(arm);
  // the stack it drives
  const st = cableStation(1.24, { stackHeight: 0.62, selected: 4 });
  st.position.set(0, 0, 0.62);
  st.scale.set(0.9, 0.62, 0.9);
  g.add(st);
  g.userData.arm = arm;
  return g;
}

export function legCurl() {
  const g = legFrame();
  const arm = new THREE.Group();
  arm.add(roller(0, 0, 0.32));
  const shaft = tube(0.019, 0.32, powder(), 'z', 12);
  shaft.position.z = 0.16;
  arm.add(shaft);
  arm.position.set(0, 0.36, -0.28);
  g.add(arm);
  const st = cableStation(1.24, { stackHeight: 0.62, selected: 3 });
  st.position.set(0, 0, 0.62);
  st.scale.set(0.9, 0.62, 0.9);
  g.add(st);
  g.userData.arm = arm;
  return g;
}

export function legPress() {
  const g = new THREE.Group();
  g.add(box(0.38, 0.08, 0.52, pad(), 0, 0.36, 0.30));
  g.add(box(0.34, 0.05, 0.48, powder(), 0, 0.315, 0.30));
  const back = box(0.38, 0.56, 0.08, pad());
  back.rotation.x = THREE.MathUtils.degToRad(-38);
  back.position.set(0, 0.62, 0.58);
  g.add(back);
  for (const x of [-0.16, 0.16]) {
    g.add(box(0.05, 0.34, 0.05, powder(), x, 0.17, 0.30));
    // the rails the sled runs on
    const rail = box(0.05, 1.70, 0.05, powder());
    rail.rotation.x = THREE.MathUtils.degToRad(-38);
    rail.position.set(x, 0.86, -0.42);
    g.add(rail);
    g.add(box(0.06, 0.05, 0.60, powder(), x, 0.026, -0.10));
  }
  // the sled: a footplate with a frame and a sleeve either side
  const sled = new THREE.Group();
  sled.add(box(0.62, 0.62, 0.055, powder(0x2a3040)));
  for (const x of [-0.24, 0.24]) sled.add(box(0.05, 0.66, 0.05, powder(), x, 0, -0.05));
  for (const s of [-1, 1]) {
    const sleeve = tube(0.025, 0.24, metal(CHROME, 0.26), 'x', 16);
    sleeve.position.set(s * 0.44, 0, -0.05);
    sled.add(sleeve);
    for (const kg of [20, 20]) {
      const p = bumper(kg);
      p.position.set(s * (0.38 + (kg === 20 ? 0 : 0.06)), 0, -0.05);
      sled.add(p);
    }
  }
  sled.rotation.x = THREE.MathUtils.degToRad(-38);
  sled.position.set(0, 0.80, -0.52);
  g.add(sled);
  g.userData.sled = sled;
  return g;
}

export function smithRack() {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    g.add(box(0.085, 2.24, 0.085, powder(), s * 0.74, 1.12, -0.30));
    g.add(box(0.24, 0.05, 0.56, powder(), s * 0.74, 0.026, -0.30));
    // the guide rail the bar runs on, and the hooks along it
    const rail = tube(0.016, 2.10, metal(CHROME, 0.24), 'y', 12);
    rail.position.set(s * 0.66, 1.10, -0.30);
    g.add(rail);
    for (let i = 0; i < 9; i++) {
      g.add(box(0.05, 0.016, 0.09, powder(0x2a3040), s * 0.70, 0.62 + i * 0.14, -0.25));
    }
  }
  g.add(box(1.56, 0.06, 0.06, powder(), 0, 2.21, -0.30));
  return g;
}

/* --------------------------------- cable ---------------------------------- */

// A cable that actually runs from the pulley to the hands, and is re-aimed
// every frame. This is the difference between a cable machine and a post.
export function cable() {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 1, 8), metal(0x76808f, 0.45));
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
