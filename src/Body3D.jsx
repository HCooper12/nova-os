import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { poseAt, PATTERNS, equipmentFor, patternFor } from './exercise3d.js';
import * as GYM from './gym3d.js';
import { css } from './css.js';

// THE FIGURE — a real body, performing the lift, with the muscles it trains lit.
//
// What this replaced, and why. The first version was capsules and spheres on a
// joint hierarchy, driven by the flat figure's CSS transform strings: a squat
// was `scaleY(0.86)`, so the legs SHRANK instead of the hips and knees
// flexing. Hayden, 8 Sep 2026: "terrible… most of the exercises are completely
// wrong with how the movement is actually meant to be carried out."
//
// Now: an anatomically modelled male (Blender's CC0 Human Base Meshes, given
// his proportions and segmented per muscle by tools/anatomy/) driven by real
// joint angles from `exercise3d.js`, holding the equipment the lift actually
// uses. The rig's bones are the ones a body has — pelvis, spine, chest, and a
// thigh/shin/foot and clavicle/upperarm/forearm/hand per side — so a hip hinge
// hinges at the hip.

const MODEL_URL = `${import.meta.env.BASE_URL}models/body.glb`;

const PRIMARY = new THREE.Color(0xff7ad9);   // --nv-mg
const SECONDARY = new THREE.Color(0x59e6ff); // --nv-cy
const RESTING = new THREE.Color(0x8d94ac);   // muscle at rest — a body, not a diagram
const FRAME = new THREE.Color(0xa9a2b8);

let cached = null;   // the parsed GLB, shared across every card that opens

function loadModel() {
  if (!cached) {
    cached = new Promise((resolve, reject) => {
      new GLTFLoader().load(MODEL_URL, (g) => resolve(g), undefined, reject);
    }).catch((e) => { cached = null; throw e; });
  }
  return cached;
}

/* ------------------------------- equipment -------------------------------
 * What each equipment id puts in the scene, and how the body relates to it:
 *   obj      a single object; `prop` means it stands in the world, otherwise
 *            the hands carry it
 *   perHand  one built per hand (dumbbells)
 *   hold     'hands' | 'traps' | 'front-rack' — where a carried bar rides
 *   cable    { from } — run a cable from that anchor to whatever is held, and
 *            re-aim it every frame. A cable machine whose cable does not move
 *            is furniture.
 */
const RIG = {
  'barbell-back': () => ({ obj: GYM.barbell(), hold: 'traps' }),
  'barbell-front': () => ({ obj: GYM.barbell(), hold: 'front-rack' }),
  'barbell-hands': () => ({ obj: GYM.barbell(), hold: 'hands' }),
  'barbell-floor': () => ({ obj: GYM.barbell(), hold: 'hands' }),
  'barbell-ez': () => ({ obj: GYM.ezBar(), hold: 'hands' }),
  'trap-bar': () => ({ obj: GYM.trapBar(), hold: 'hands' }),
  'smith-bar': () => ({ obj: GYM.barbell(1.5), hold: 'hands', extraProp: GYM.smithRack() }),
  dumbbells: () => ({ obj: null, perHand: GYM.dumbbell }),
  'dumbbell-single': () => ({ obj: null, perHand: GYM.dumbbell, single: true }),
  'bench-flat': () => ({ obj: GYM.bench(0), prop: true, extra: GYM.barbell(), hold: 'hands' }),
  'bench-flat-db': () => ({ obj: GYM.bench(0), prop: true, perHand: GYM.dumbbell }),
  'bench-incline': () => ({ obj: GYM.bench(30), prop: true, extra: GYM.barbell(), hold: 'hands' }),
  'bench-incline-db': () => ({ obj: GYM.bench(30), prop: true, perHand: GYM.dumbbell }),
  'bench-thrust': () => ({ obj: GYM.bench(0), prop: true, extra: GYM.barbell(), hold: 'hands' }),
  // cables: the station stands behind him, the handle is in his hands, and the
  // cable runs between the two
  'cable-high': () => cableRig(2.05, GYM.straightAttachment(0.5), -1.05),
  'cable-mid': () => cableRig(1.20, GYM.dHandle(), -1.05),
  'cable-low': () => cableRig(0.28, GYM.straightAttachment(0.5), -1.05),
  'cable-rope': () => cableRig(2.05, GYM.ropeAttachment(), -1.05),
  'lat-pulldown': () => {
    const st = GYM.latPulldown();
    st.position.set(0, 0, -0.62);
    return {
      obj: st, prop: true, extra: GYM.latBar(), hold: 'hands',
      cableFrom: st.userData.anchor.clone().add(st.position), wheel: st.userData.wheel,
    };
  },
  'pullup-bar': () => {
    const rig = GYM.pullupRig();
    return { obj: rig, prop: true, hangY: rig.userData.bar.position.y - 0.035 };
  },
  'machine-legcurl': () => ({ obj: GYM.legCurl(), prop: true }),
  'machine-legext': () => ({ obj: GYM.legExtension(), prop: true }),
  'machine-legpress': () => {
    const m = GYM.legPress();
    m.position.set(0, 0, 0.30);     // the seat under him, the sled at his feet
    return { obj: m, prop: true };
  },
  none: () => ({ obj: null }),
};

function cableRig(anchorY, attachment, z) {
  const st = GYM.cableStation(anchorY);
  st.position.set(0, 0, z);
  return {
    obj: st, prop: true, extra: attachment, hold: 'hands',
    cableFrom: st.userData.anchor.clone().add(st.position), wheel: st.userData.wheel,
  };
}

/* --------------------------------- posing -------------------------------- */

// Rotate a bone by `deg` about a WORLD axis, on top of its rest pose. Doing it
// in world terms means the data can say "the hip flexes 100°" and mean it,
// whatever direction the bone happens to point in its rest orientation.
function rotate(bone, rest, axis, deg) {
  if (!bone || !rest) return;
  // ZERO IS A POSE, NOT AN ABSENCE. This used to return early on deg === 0 and
  // leave the bone wherever it happened to be — so any joint passing through
  // neutral kept the last angle it was given, and the figure drifted a little
  // further from anatomy every frame. At the top of a squat the thigh still
  // held the bottom's 100° of flexion, which is why a standing lockout
  // rendered as a man reclining with his knees above his hips.
  if (!deg) {
    bone.quaternion.copy(rest);
    bone.updateMatrixWorld(true);
    return;
  }
  const parentQ = new THREE.Quaternion();
  if (bone.parent) bone.parent.getWorldQuaternion(parentQ);
  const local = axis.clone().applyQuaternion(parentQ.clone().invert()).normalize();
  const delta = new THREE.Quaternion().setFromAxisAngle(local, THREE.MathUtils.degToRad(deg));
  bone.quaternion.copy(delta).multiply(rest);
  bone.updateMatrixWorld(true);
}

// THE BODY'S OWN AXES, not the world's.
//
// Every joint angle here is anatomical — "the hip flexes 85°" — and flexion
// happens in the body's sagittal plane. Rotating about the WORLD x axis is the
// same thing only while the body is standing up. Lay it on a bench and the
// world axes no longer mean anything anatomical: a bench press folded its legs
// the wrong way, shins pointing at the ceiling, because +85° of knee flexion
// was applied about an axis that no longer ran through the body's hips.
//
// So the axes are taken from the root's own orientation in the stance the lift
// is performed in, and every rotation below is expressed in them.
const AXES_WORLD = {
  X: new THREE.Vector3(1, 0, 0), Y: new THREE.Vector3(0, 1, 0), Z: new THREE.Vector3(0, 0, 1),
};

function bodyAxes(root) {
  const q = root.getWorldQuaternion(new THREE.Quaternion());
  return {
    X: new THREE.Vector3(1, 0, 0).applyQuaternion(q).normalize(),   // flexion
    Y: new THREE.Vector3(0, 1, 0).applyQuaternion(q).normalize(),   // twist
    Z: new THREE.Vector3(0, 0, 1).applyQuaternion(q).normalize(),   // abduction
  };
}

// The base mesh stands in an A-pose: each arm is already ~40° abducted. Pose
// data is written in ANATOMICAL terms (0° = the arm hanging at the side), so
// the rest abduction has to be subtracted or every overhead lift sweeps the
// arms inward until they cross over the head — which is what it did.
function restAbduction(bones, side, root = null) {
  const sh = bones[`upperarm${side}`];
  const el = bones[`forearm${side}`];
  if (!sh || !el) return 0;
  const a = new THREE.Vector3(); const b = new THREE.Vector3();
  sh.getWorldPosition(a); el.getWorldPosition(b);
  const v = b.sub(a);
  // in the BODY's frame, not the world's — measured against world x and y it
  // read the wrong angle for every lift that is not performed standing up
  if (root) v.applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()).invert());
  return THREE.MathUtils.radToDeg(Math.atan2(Math.abs(v.x), Math.abs(v.y)));
}

function applyPose(bones, rest, pose, restAbduct = { L: 0, R: 0 }, axes = null) {
  if (!pose) return;
  const X = (axes || AXES_WORLD).X;
  const Z = (axes || AXES_WORLD).Z;
  const set = (name, axis, deg) => rotate(bones[name], rest[name], axis, deg);
  // trunk, root down — a child's world axis is only right once its parent is posed
  set('pelvis', X, (pose.hipTilt || 0));
  set('spine', X, -(pose.spine || 0));
  set('chest', X, -(pose.chest || 0));
  set('neck', X, -(pose.neck || 0));
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1;
    // shoulder: flexion about X, abduction about Z (mirrored)
    const sh = bones[`upperarm${side}`];
    if (sh) {
      const parentQ = new THREE.Quaternion();
      sh.parent.getWorldQuaternion(parentQ);
      const inv = parentQ.clone().invert();
      const q = new THREE.Quaternion();
      if (pose.shoulder) {
        q.multiply(new THREE.Quaternion().setFromAxisAngle(X.clone().applyQuaternion(inv).normalize(),
          THREE.MathUtils.degToRad(-pose.shoulder)));
      }
      // always rotate FROM the rest abduction to the angle asked for
      const abd = (pose.shoulderAbduct != null ? pose.shoulderAbduct : 0) - restAbduct[side];
      if (abd) {
        q.multiply(new THREE.Quaternion().setFromAxisAngle(Z.clone().applyQuaternion(inv).normalize(),
          THREE.MathUtils.degToRad(s * abd)));
      }
      sh.quaternion.copy(q).multiply(rest[`upperarm${side}`]);
      sh.updateMatrixWorld(true);
      // the deltoid helper takes half the rotation — the cap follows the arm,
      // the chest and trap stay where they belong
      const dl = bones[`deltoid${side}`];
      if (dl) {
        const pq = new THREE.Quaternion();
        dl.parent.getWorldQuaternion(pq);
        const iv = pq.clone().invert();
        const h = new THREE.Quaternion();
        if (pose.shoulder) {
          h.multiply(new THREE.Quaternion().setFromAxisAngle(X.clone().applyQuaternion(iv).normalize(),
            THREE.MathUtils.degToRad(-pose.shoulder * 0.5)));
        }
        const abdH = ((pose.shoulderAbduct != null ? pose.shoulderAbduct : 0) - restAbduct[side]) * 0.5;
        if (abdH) {
          h.multiply(new THREE.Quaternion().setFromAxisAngle(Z.clone().applyQuaternion(iv).normalize(),
            THREE.MathUtils.degToRad(s * abdH)));
        }
        dl.quaternion.copy(h).multiply(rest[`deltoid${side}`]);
        dl.updateMatrixWorld(true);
      }
    }
    set(`forearm${side}`, X, -(pose.elbow || 0));
    const back = side === 'R' && pose.hipBack != null;
    // About WORLD +X, a point below the joint swings POSTERIOR — which is knee
    // flexion and hip EXTENSION. So the hip takes the angle as written
    // (flexion is negative) and the knee takes it positive. Getting this
    // backwards bent the knee the wrong way, which is exactly the class of
    // error that made the old figure wrong.
    set(`thigh${side}`, X, back ? (pose.hipBack || 0) : (pose.hip || 0));
    set(`shin${side}`, X, back ? (pose.kneeBack || 0) : (pose.knee || 0));
    set(`foot${side}`, X, (pose.ankle || 0));
    // same rule for the shrug: absent means back to rest, not "leave it"
    const c = bones[`clavicle${side}`];
    if (c && rest[`clavicle${side}_pos`]) {
      c.position.y = rest[`clavicle${side}_pos`].y + 0.035 * (pose.shoulderShrug || 0);
      c.updateMatrixWorld(true);
    }
  }
}

// `phase` freezes the rep at one point of its cycle instead of animating, and
// `view` picks the camera. Both exist for tools/motion/harness.html — the
// standing motion check runs THIS component, so what it passes is what ships.
/* ------------------------------ standing on -------------------------------
 * A STANDING LIFT IS A CLOSED CHAIN. The rig is rooted at the pelvis, so
 * posing the hip and knee folds the legs while the pelvis stays exactly where
 * it was — the figure squatted by sitting down onto an invisible chair, torso
 * bolt upright, feet swinging in the air, the bar never descending. Hayden,
 * 9 Sep 2026: "some extra stretching… that does not make it look anatomically
 * correct and like a human actually moves."
 *
 * The body does not hang from its pelvis. It stands on the floor. So after
 * every pose, the whole figure is rotated and dropped until the feet are back
 * where physics puts them:
 *
 *   1. LEAN — turn the body about X until the shin sits at the angle the
 *      ankle is dorsiflexed to. This is where a squat's forward torso lean
 *      comes from; it was never in the joint data because it is not a joint.
 *   2. PLANT — drop the body until the lower sole touches the floor, and slide
 *      it so the feet stay over the same spot instead of walking away.
 *
 * Everything the lift moves then follows for free: the bar descends because
 * the traps descend, the head stays over the feet, the hips travel back.
 */
function restContacts(bones) {
  // Two points per foot, in the FOOT bone's own space: the floor under the
  // ankle, and the floor under the toe. Two, because a calf raise pivots on
  // the toe and a squat sits on the whole sole — tracking one point put the
  // toes through the floor the moment the heel came up.
  const out = { z0: 0 };
  let z = 0; let n = 0;
  for (const side of ['L', 'R']) {
    const f = bones[`foot${side}`];
    if (!f) continue;
    const ankle = f.getWorldPosition(new THREE.Vector3());
    const toe = f.localToWorld(new THREE.Vector3(0, 1, 0));
    out[side] = {
      heel: f.worldToLocal(new THREE.Vector3(ankle.x, 0, ankle.z)),
      toe: f.worldToLocal(new THREE.Vector3(toe.x, 0, toe.z)),
    };
    z += ankle.z; n += 1;
  }
  out.z0 = n ? z / n : 0;
  return out;
}

const WORLD_X = new THREE.Vector3(1, 0, 0);

function pitchOf(v, fwd) {
  // + when the far end points ANTERIOR of straight down
  return Math.atan2(v.dot(fwd), -v.y);
}

function segPitch(bones, a, b, fwd) {
  const A = bones[a]; const B = bones[b];
  if (!A || !B) return 0;
  return pitchOf(B.getWorldPosition(new THREE.Vector3()).sub(A.getWorldPosition(new THREE.Vector3())), fwd);
}

function footPitch(bones, side, fwd) {
  const f = bones[`foot${side}`];
  if (!f) return 0;
  const head = f.getWorldPosition(new THREE.Vector3());
  return pitchOf(f.localToWorld(new THREE.Vector3(0, 1, 0)).sub(head), fwd);
}

// Turn something about the world X axis until a measured angle hits its target.
// Three sign conventions meet in this file — Blender's bone axes, the glTF
// Y-up conversion, and this file's flexion signs — and reasoning through all
// three produced a squat that reclined backwards. So the correction checks
// itself: apply it, measure again, and if the error grew, take the other way.
function turnUntil(obj, measure, target) {
  const err = () => measure() - target;
  const d = err();
  if (Math.abs(d) < 1e-4) return;
  obj.rotateOnWorldAxis(WORLD_X, -d);
  obj.updateMatrixWorld(true);
  if (Math.abs(err()) > Math.abs(d)) {
    obj.rotateOnWorldAxis(WORLD_X, 2 * d);
    obj.updateMatrixWorld(true);
  }
}

/* A HANG IS A CONTACT TOO.
 *
 * A pull-up is the mirror of a squat: the hands are the fixed point and the
 * body travels. Placed at a guessed height the figure stood beside the frame
 * with its arms up, and nothing about the rep read as rising to a bar. So the
 * hands are pinned to the bar and the body hangs from them — which makes the
 * chin clearing the bar the actual output of the joint angles, not a promise.
 */
function hangFrom(root, bones, barY) {
  const l = bones.handL; const r = bones.handR;
  if (!l || !r || barY == null) return;
  const y = (l.getWorldPosition(new THREE.Vector3()).y + r.getWorldPosition(new THREE.Vector3()).y) / 2;
  root.position.y += barY - y;
  root.updateMatrixWorld(true);
}

/* A LYING LIFT RESTS ON A PAD.
 *
 * The same fault as the standing one, wearing different clothes: the stances
 * placed the body with hand-tuned offsets, so a bench press floated a hand's
 * width above the bench and an incline press hung in the air beside it. A body
 * on a bench is in contact with it. So the contact point — the back of the
 * chest, or the glutes when seated — is measured once against the actual pad
 * plane and held there through the whole lift.
 */
const PAD = {
  // plane the body rests on: a point on it and its normal. These come from
  // bench(), so if the bench moves the body moves with it.
  supine: { bone: 'chest', into: [0, -0.105, 0], p: [0, 0.485, 0], n: [0, 1, 0] },
  incline30: { bone: 'chest', into: [0, -0.100, 0.020], p: [0, 0.485, 0], n: [0, 0.866, 0.5] },
  prone: { bone: 'chest', into: [0, -0.105, 0], p: [0, 0.485, 0], n: [0, 1, 0] },
  thrust: { bone: 'chest', into: [0, -0.105, 0], p: [0, 0.485, 0], n: [0, 1, 0] },
  seated: { bone: 'pelvis', into: [0, -0.095, 0], p: [0, 0.485, 0], n: [0, 1, 0] },
  'seated-back': { bone: 'pelvis', into: [0, -0.095, 0], p: [0, 0.400, 0], n: [0, 1, 0] },
};

function padContact(bones, stance, onFurniture = true) {
  const cfg = PAD[stance];
  const b = cfg && bones[cfg.bone];
  if (!b) return null;
  const world = b.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(...cfg.into));
  const p = new THREE.Vector3(...cfg.p);
  if (!onFurniture) p.set(0, 0.02, 0);      // the floor
  return { local: b.worldToLocal(world.clone()), bone: cfg.bone,
    p, n: new THREE.Vector3(...cfg.n).normalize() };
}

function rest_on(root, bones, pad) {
  if (!pad) return;
  const b = bones[pad.bone];
  if (!b) return;
  const world = b.localToWorld(pad.local.clone());
  // signed distance from the pad plane, pushed back along the normal
  const gap = world.clone().sub(pad.p).dot(pad.n);
  root.position.addScaledVector(pad.n, -gap);
  root.updateMatrixWorld(true);
}

/* A STANDING LIFT IS A CLOSED CHAIN.
 *
 * The rig is rooted at the pelvis, so posing the hip and knee folds the legs
 * while the pelvis stays exactly where it was: the figure squatted by sitting
 * down onto an invisible chair, torso bolt upright, feet in the air, the bar
 * never descending. Hayden, 9 Sep 2026 — "some extra stretching… that does not
 * make it look anatomically correct and like a human actually moves."
 *
 * A body does not hang from its pelvis; it stands on the floor. So after every
 * pose, three things are solved in order:
 *
 *   1. LEAN — turn the whole figure until the SHIN sits where the ankle angle
 *      says it should. This is where a squat's forward torso lean comes from,
 *      and it was never in the joint data because it is not a joint.
 *   2. ANKLE — turn each foot until it is flat on the floor, or, when the lift
 *      plantarflexes, until the heel has lifted by exactly that much.
 *   3. PLANT — drop until the lowest contact point (heel or toe) touches, and
 *      slide so the feet stay over the same spot instead of walking off.
 *
 * Everything else follows for free: the bar descends because the traps do, the
 * hips travel back, the head stays over the feet.
 */
function settle(root, bones, pose, contacts, fwd, base) {
  if (!contacts || !contacts.L || !bones.footL) return;
  const ankle = pose?.ankle || 0;
  // Positive `ankle` is DORSIFLEXION — the shin travels forward over a planted
  // foot. Negative is plantarflexion, where the heel leaves the floor and the
  // shin stays put; a squat's shin must lean, a calf raise's must not.
  turnUntil(root, () => segPitch(bones, 'shinL', 'footL', fwd),
    -THREE.MathUtils.degToRad(Math.max(ankle, 0)));

  const heelLift = THREE.MathUtils.degToRad(Math.max(-ankle, 0));
  for (const side of ['L', 'R']) {
    const f = bones[`foot${side}`];
    if (f) turnUntil(f, () => footPitch(bones, side, fwd), base.pitch[side] - heelLift);
  }

  let low = Infinity; let z = 0; let n = 0;
  for (const side of ['L', 'R']) {
    const f = bones[`foot${side}`];
    if (!f || !contacts[side]) continue;
    for (const k of ['heel', 'toe']) {
      const p = f.localToWorld(contacts[side][k].clone());
      low = Math.min(low, p.y);
      if (k === 'heel') { z += p.z; n += 1; }
    }
  }
  if (!n || !Number.isFinite(low)) return;
  root.position.y -= low - base.floor;
  root.position.z -= (z / n) - contacts.z0;
  root.updateMatrixWorld(true);
}

export default function Body3D({ muscles, pattern, name = '', height = 260,
  phase: frozen = null, view = 'three-quarter', chrome = true }) {
  // The flat figure's pattern ids overlap with these but are coarser (it has
  // one "squat" for squats, leg presses and lunges). When the name resolves to
  // a 3D pattern, that wins — the whole point is that the movement is right.
  const pat = patternFor(name) || (pattern && PATTERNS[pattern] ? pattern : null);
  const mount = useRef(null);
  const [state, setState] = useState('loading');

  useEffect(() => {
    const el = mount.current;
    if (!el) return undefined;
    let raf = 0;
    let disposed = false;
    const width = el.clientWidth || 300;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 40);
    camera.position.set(1.9, 1.35, 2.9);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.0, 0);
    controls.enablePan = false;
    controls.minDistance = 1.6;
    controls.maxDistance = 6;
    controls.enableDamping = true;

    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x0b0d16, 1.25));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(2.4, 3.2, 2.6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fd8ff, 0.7);
    rim.position.set(-2.2, 1.8, -2.4);
    scene.add(rim);

    const primary = new Set(muscles?.primary || []);
    const secondary = new Set(muscles?.secondary || []);

    loadModel().then((gltf) => {
      if (disposed) return;
      // SkeletonUtils, not Object3D.clone: a plain clone of a SkinnedMesh keeps
      // pointing at the ORIGINAL skeleton, so the copy poses nothing and draws
      // nothing — the model was in the scene, correctly scaled, and invisible.
      const root = cloneSkinned(gltf.scene);
      scene.add(root);

      // tint each muscle group's own material — the segmentation the model was
      // built with IS the highlight, so a lit muscle is the real muscle
      root.traverse((o) => {
        if (!o.isMesh) return;
        o.frustumCulled = false;
        const wasArray = Array.isArray(o.material);
        const mats = wasArray ? o.material : [o.material];
        const tinted = mats.map((m) => {
          const mat = m.clone();
          const group = (m.name || '').replace(/^mus_/, '');
          const lit = primary.has(group) ? PRIMARY : secondary.has(group) ? SECONDARY : null;
          mat.color = (lit || (group === 'frame' ? FRAME : RESTING)).clone();
          mat.roughness = 0.62;
          mat.metalness = 0.0;
          if (lit) mat.emissive = lit.clone().multiplyScalar(0.22);
          return mat;
        });
        // Keep the SHAPE of material: each mesh here carries exactly one, and
        // assigning a one-element ARRAY makes three.js look for geometry groups
        // that do not exist — the model was present, lit and invisible.
        o.material = wasArray ? tinted : tinted[0];
      });

      const bones = {};
      const rest = {};
      root.traverse((o) => {
        if (o.isBone) {
          bones[o.name] = o;
          rest[o.name] = o.quaternion.clone();
          rest[`${o.name}_pos`] = o.position.clone();
        }
      });

      // STANCE — where the body IS. A bench press lies down, a pull-up hangs,
      // a leg extension sits. Posing joints alone left every lift standing at
      // the origin, which read as a man doing a bench press in mid-air.
      const stance = (pat && PATTERNS[pat] && PATTERNS[pat].stance) || 'standing';
      const BENCH_TOP = 0.49;      // pad height, matching bench()
      if (stance === 'supine') {
        root.rotation.x = -Math.PI / 2;      // on his back, head toward -Z
        root.position.set(0, BENCH_TOP, 0.42);
      } else if (stance === 'incline30') {
        root.rotation.x = -Math.PI / 2 + THREE.MathUtils.degToRad(30);
        root.position.set(0, BENCH_TOP + 0.10, 0.30);
      } else if (stance === 'prone') {
        root.rotation.x = Math.PI / 2;
        root.position.set(0, BENCH_TOP, -0.42);
      } else if (stance === 'hanging') {
        root.position.set(0, 0.30, 0);       // feet clear of the floor
      } else if (stance === 'seated') {
        root.position.set(0, BENCH_TOP - 0.44, 0.10);
      } else if (stance === 'seated-back') {
        root.rotation.x = -THREE.MathUtils.degToRad(55);
        root.position.set(0, 0.62, 0.34);
      } else if (stance === 'thrust') {
        root.rotation.x = -Math.PI / 2;
        root.position.set(0, BENCH_TOP - 0.06, 0.10);
      }
      root.updateMatrixWorld(true);
      // measured in the rest pose, in the stance the lift is performed in
      const GROUNDED = stance === 'standing';
      // A pad only exists if the lift actually has one. A crunch on 'supine'
      // was being seated on an invisible bench half a metre up.
      const onFurniture = /bench|machine|thrust/.test(equipmentFor(name, pat) || '');
      const pad = PAD[stance] ? padContact(bones, stance, onFurniture) : null;
      const axes = bodyAxes(root);
      const contacts = restContacts(bones);
      const fwd = (() => {
        // Which way the toes point, measured off the rig rather than assumed:
        // a Blender bone's local +Y runs head → tail and the foot bone's tail
        // is the toe. Guessing it from an axis convention is how a figure ends
        // up squatting backwards.
        const f = bones.footL || bones.footR;
        if (!f) return new THREE.Vector3(0, 0, 1);
        const d = f.localToWorld(new THREE.Vector3(0, 1, 0)).sub(f.getWorldPosition(new THREE.Vector3()));
        d.y = 0;
        return d.lengthSq() < 1e-9 ? new THREE.Vector3(0, 0, 1) : d.normalize();
      })();
      // MEASURED ON THE REST BODY, before a single joint is touched. When the
      // framing pass started posing the figure, this line still sat after it
      // and read the A-pose abduction off an arm already holding a barbell —
      // every arm in every lift was then rotated from a fiction.
      const restAbduct = { L: restAbduction(bones, 'L', root), R: restAbduction(bones, 'R', root) };
      const baseTransform = {
        pos: root.position.clone(), quat: root.quaternion.clone(), floor: 0,
        pitch: { L: footPitch(bones, 'L', fwd), R: footPitch(bones, 'R', fwd) },
      };

      // equipment
      const eq = equipmentFor(name, pat);
      const spec = (RIG[eq] || RIG.none)();
      const held = [];
      if (spec.obj) {
        scene.add(spec.obj);
        if (!spec.prop) held.push(spec.obj);
      }
      if (spec.extraProp) scene.add(spec.extraProp);
      let cableMesh = null;
      if (spec.cableFrom) {
        cableMesh = GYM.cable();
        scene.add(cableMesh);
      }
      if (spec.extra) { scene.add(spec.extra); held.push(spec.extra); }
      if (spec.perHand) {
        for (const side of spec.single ? ['L'] : ['L', 'R']) {
          const d = spec.perHand();
          d.userData.hand = side;
          scene.add(d);
          held.push(d);
        }
      }

      // Frame what is actually there, so a lying figure is not half off-screen.
      // The box is taken at the WORKING end of the rep, not the rest pose: a
      // squat's rest pose is a standing man and framing on that cropped his
      // head off at the bottom of the descent.
      {
        const box = new THREE.Box3();
        for (const ph of [0, 0.5, 1]) {
          root.position.copy(baseTransform.pos);
          root.quaternion.copy(baseTransform.quat);
          root.updateMatrixWorld(true);
          if (pat) {
            const po = poseAt(pat, ph);
            applyPose(bones, rest, po, restAbduct, axes);
            if (GROUNDED) settle(root, bones, po, contacts, fwd, baseTransform);
            else if (pad) rest_on(root, bones, pad);
            else if (spec.hangY != null) hangFrom(root, bones, spec.hangY);
          }
          box.union(new THREE.Box3().setFromObject(root));
        }
        const c = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const radius = Math.max(size.x, size.y, size.z) * 0.62 + 0.35;
        controls.target.copy(c);
        const DIR = {
          'three-quarter': [1.15, 0.45, 1.75],
          front: [0.0, 0.30, 2.1],
          side: [2.1, 0.30, 0.0],
          back: [0.0, 0.30, -2.1],
        }[view] || [1.15, 0.45, 1.75];
        camera.position.set(c.x + radius * DIR[0], c.y + radius * DIR[1], c.z + radius * DIR[2]);
        camera.near = 0.05;
        camera.far = 60;
        camera.updateProjectionMatrix();
        controls.update();
      }
      // The motion check needs to read the rig it is judging, not guess from
      // pixels. Costs one array entry; makes every future check measurable.
      if (typeof window !== 'undefined' && window.__NOVA_MOTION) {
        window.__NOVA_MOTION.push({ root, bones, pat, frozen, contacts, fwd, base: baseTransform });
      }
      // Where a bar RIDES the body — across the traps, or racked on the front
      // delts. Anchored in the chest bone's own space, worked out once from the
      // rest pose, so the bar follows the torso through the lift instead of
      // hanging at a fixed world height while the man squats away beneath it.
      const anchor = {};
      if (bones.chest) {
        // measured off the body, not written as coordinates: a front rack is
        // "in front of the collarbones", and hardcoding +Z for that put the bar
        // behind his head
        const c = bones.chest.getWorldPosition(new THREE.Vector3());
        anchor.traps = bones.chest.worldToLocal(
          c.clone().addScaledVector(axes.Y, 0.190).addScaledVector(fwd, -0.055));
        anchor['front-rack'] = bones.chest.worldToLocal(
          c.clone().addScaledVector(axes.Y, 0.140).addScaledVector(fwd, 0.105));
      }
      const clock = new THREE.Clock();
      const period = 3.4;   // one controlled rep
      const tmp = new THREE.Vector3();
      const tick = () => {
        raf = requestAnimationFrame(tick);
        const phase = frozen != null ? frozen : (pat ? (clock.getElapsedTime() % period) / period : 0);
        if (pat) {
          const pose = poseAt(pat, phase);
          // from the same starting transform every frame, or the corrections
          // below compound and the figure walks out of shot
          root.position.copy(baseTransform.pos);
          root.quaternion.copy(baseTransform.quat);
          root.updateMatrixWorld(true);
          applyPose(bones, rest, pose, restAbduct, axes);
          if (GROUNDED) settle(root, bones, pose, contacts, fwd, baseTransform);
          else if (pad) rest_on(root, bones, pad);
          else if (spec.hangY != null) hangFrom(root, bones, spec.hangY);
        }

        // put whatever is held where the hands are
        for (const obj of held) {
          const hand = obj.userData.hand;
          if (hand) {
            const b = bones[`hand${hand}`];
            if (b) { b.getWorldPosition(tmp); obj.position.copy(tmp); obj.quaternion.identity(); }
          } else {
            const l = bones.handL; const r = bones.handR;
            if (l && r) {
              const a = new THREE.Vector3(); const b2 = new THREE.Vector3();
              l.getWorldPosition(a); r.getWorldPosition(b2);
              obj.position.copy(a).add(b2).multiplyScalar(0.5);
              const ride = anchor[spec.hold];
              if (ride && bones.chest) obj.position.copy(bones.chest.localToWorld(ride.clone()));
              obj.quaternion.identity();
            }
          }
        }
        // the cable follows the hands, and the pulley turns with it
        if (cableMesh && spec.cableFrom) {
          const l = bones.handL; const r = bones.handR;
          if (l && r) {
            const to = l.getWorldPosition(new THREE.Vector3())
              .add(r.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
            GYM.aimCable(cableMesh, spec.cableFrom, to);
            if (spec.wheel) spec.wheel.rotation.x = -to.y * 6;
          }
        }
        controls.update();
        renderer.render(scene, camera);
      };
      setState('ready');
      tick();
    }).catch(() => setState('error'));

    // The sheet animates in, so clientWidth at mount was 46px and the canvas
    // rendered as a 92px stamp. Watch the element instead of trusting one read.
    const fit = () => {
      const w = Math.max(160, el.clientWidth || el.parentElement?.clientWidth || width);
      renderer.setSize(w, height);
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(el);
    const onResize = fit;
    window.addEventListener('resize', onResize);
    setTimeout(fit, 60);
    setTimeout(fit, 400);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      if (ro) ro.disconnect();
      controls.dispose();
      renderer.dispose();
      // dispose() frees three.js's own objects but NOT the WebGL context, and a
      // browser keeps only about sixteen. Every opened-and-closed exercise
      // sheet leaked one, so after a dozen the figure simply stopped drawing —
      // a white panel, no error. The motion sheet hit it first because React's
      // StrictMode mounts each card twice.
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
    };
  }, [muscles, pat, name, height, frozen, view]);

  const p = pat ? PATTERNS[pat] : null;
  return (
    <div>
      <div ref={mount} style={{ width: '100%', height: `${height}px`, borderRadius: '12px', overflow: 'hidden' }} />
      {!chrome ? null : (
      <div style={css('margin-top:6px;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap')}>
        <span style={css('font:var(--nv-micro-s);letter-spacing:var(--nv-micro-track);color:color-mix(in srgb, var(--nv-ink) 38%, transparent)')}>
          {state === 'error' ? 'THE MODEL COULD NOT LOAD' : 'DRAG TO TURN'}
        </span>
        {p && <span style={css('font-size:11.5px;color:color-mix(in srgb, var(--nv-ink) 55%, transparent)')}>{p.label}</span>}
      </div>
      )}
      {chrome && p?.cue && (
        <div style={css('margin-top:4px;font-size:11.5px;line-height:1.5;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)')}>{p.cue}</div>
      )}
    </div>
  );
}
