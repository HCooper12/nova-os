import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { poseAt, PATTERNS, equipmentFor, patternFor, gripFor } from './exercise3d.js';
import * as GYM from './gym3d.js';
import * as JOINT from './rig3d.js';
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
// SKIN, not a swatch. A body rendered in flat lavender reads as a diagram of a
// person; the point of this figure is that it IS a person, doing the lift. The
// resting surface is a real mid skin tone under image-based light, and a lit
// muscle is that skin pushed toward the highlight rather than replaced by it —
// so the anatomy still reads and the body still looks like a body.
const SKIN = new THREE.Color(0xb98a6d);
const SKIN_DEEP = new THREE.Color(0x8f6047);  // frame: bone and joint, a shade under
const SUBSURFACE = new THREE.Color(0xd8674a); // the red that light takes coming back out

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
  'barbell-floor': () => ({ obj: GYM.barbell(), hold: 'hands', floorRests: true }),
  'barbell-ez': () => ({ obj: GYM.ezBar(), hold: 'hands' }),
  'trap-bar': () => ({ obj: GYM.trapBar(), hold: 'hands', floorRests: true }),
  'smith-bar': () => ({ obj: GYM.barbell(10, { centreKnurl: false }), hold: 'hands', extraProp: GYM.smithRack() }),
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
    const b = rig.userData.bar.position;
    return { obj: rig, prop: true, hangAt: new THREE.Vector3(b.x, b.y - 0.035, b.z) };
  },
  'machine-legcurl': () => ({ obj: GYM.legCurl(), prop: true }),
  'machine-legext': () => ({ obj: GYM.legExtension(), prop: true }),
  'machine-legpress': () => {
    const m = GYM.legPress();
    // the machine is placed against the BODY, not the other way round: the
    // seat under his hips, the sled where his feet actually end up
    m.position.set(0, 0.10, -0.34);
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

/* THE POSE, JOINT BY JOINT.
 *
 * Every rotation below goes through `src/rig3d.js`, which means two things it
 * did not mean before: each joint turns about an axis belonging to the BONE
 * ABOVE IT rather than to the room, and each is bounded by the range a real
 * one has. An elbow is a hinge whose axis runs through the humerus from one
 * epicondyle to the other and travels with the arm; rotating the forearm about
 * the body's lateral axis instead swung it through a plane the elbow does not
 * have, which is what "bent like spaghetti" looks like.
 */
function applyPose(bones, rest, frames, pose, restAbduct = { L: 0, R: 0 }) {
  if (!pose) return;
  const F = (n) => frames[n];
  // TWO SIGN CONVENTIONS MEET HERE, and mixing them silently cost a rebuild.
  // The DATA says what the body does — "the elbow flexes 95°", "the hip flexes
  // 100°" (written negative, historically) — while the RENDERER needs which
  // way to turn a bone. The range of motion belongs to the first: clamped
  // against the rotation instead, 95° of elbow flexion came out as 5° and
  // every arm in the app hung dead straight.
  const j = (name, axis, anat, rom, dir = -1) =>
    JOINT.hinge(bones[name], rest[name], F(name), axis, dir * JOINT.clampTo(anat, rom), null);

  // TRUNK, root down — a child's frame is only meaningful once its parent is posed
  j('pelvis', 'lateral', pose.hipTilt || 0, JOINT.ROM.spine, 1);
  j('spine', 'lateral', pose.spine || 0, JOINT.ROM.spine);
  JOINT.roll(bones.spine, pose.spineTwist || 0, JOINT.ROM.spineTwist);
  j('chest', 'lateral', pose.chest || 0, JOINT.ROM.chest);
  j('neck', 'lateral', pose.neck || 0, JOINT.ROM.neck);
  JOINT.roll(bones.neck, pose.neckTurn || 0, JOINT.ROM.neckTurn);
  // The head goes through here too, even though no pose names it. Every bone
  // this function touches gets reset to rest first; a bone it does not touch
  // keeps whatever the last frame left on it — and levelGaze and secondary
  // both PREMULTIPLY onto the head. It was accumulating a few degrees per
  // frame for as long as the panel stayed open, so the longer he looked at
  // the figure the further its head tipped back. Silent, and it looked like a
  // posing fault every time.
  j('head', 'lateral', pose.headPitch || 0, JOINT.ROM.neck);

  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1;
    // the scapula takes its share of the elevation; the humerus takes the rest
    const { scap, keep } = JOINT.scapularShare(pose);
    // sign MEASURED, not assumed: as the arm went up the shoulder joint fell
    // ten centimetres, so the scapula's share was being subtracted from the
    // elevation instead of added to it, and an overhead press topped out at
    // ear height. See the note above hinge() about clamping the anatomy first.
    JOINT.hinge(bones[`clavicle${side}`], rest[`clavicle${side}`], F(`clavicle${side}`),
      'anterior', s * scap, null);
    const abd = ((pose.shoulderAbduct != null ? pose.shoulderAbduct : 0) * keep) - restAbduct[side];

    // SHOULDER — a ball joint, composed the way a clinician measures it:
    // flexion, then abduction, then rotation about the arm itself.
    const spec = [
      ['lateral', -JOINT.clampTo((pose.shoulder || 0) * keep, JOINT.ROM.shoulder), null],
      ['anterior', s * abd, null],
      ['long', s * JOINT.clampTo(pose.shoulderRotate || 0, JOINT.ROM.shoulderRotate), null],
    ];
    JOINT.ball(bones[`upperarm${side}`], rest[`upperarm${side}`], F(`upperarm${side}`), spec);
    // the deltoid helper takes half the rotation — the cap follows the arm,
    // the chest and trap stay where they belong
    JOINT.ball(bones[`deltoid${side}`], rest[`deltoid${side}`], F(`deltoid${side}`),
      spec.map(([ax, d, r]) => [ax, d * 0.5, r]));

    // ELBOW — a hinge on the humerus, and the reason rig3d.js exists
    j(`forearm${side}`, 'lateral', pose.elbow || 0, JOINT.ROM.elbow);
    // pronation is progressive along a real forearm; all of it at the elbow
    // corkscrews the mesh, so it is split with the wrist
    JOINT.roll(bones[`forearm${side}`], s * (pose.forearmTwist || 0) * 0.45, JOINT.ROM.forearmTwist);
    j(`hand${side}`, 'lateral', pose.wrist || 0, JOINT.ROM.wrist);
    JOINT.roll(bones[`hand${side}`], s * (pose.forearmTwist || 0) * 0.55, JOINT.ROM.forearmTwist);
    JOINT.closeHand(bones, rest, frames, side, pose.grip, pose.gripStyle, pose.gripSpread);

    // HIP — a ball joint like the shoulder. The data writes flexion NEGATIVE
    // here, so the range is read against its opposite.
    const back = side === 'R' && pose.hipBack != null;
    const hipFlex = -(back ? (pose.hipBack || 0) : (pose.hip || 0));
    JOINT.ball(bones[`thigh${side}`], rest[`thigh${side}`], F(`thigh${side}`), [
      ['lateral', -JOINT.clampTo(hipFlex, JOINT.ROM.hip), null],
      ['anterior', s * JOINT.clampTo(pose.hipAbduct || 0, JOINT.ROM.hipAbduct), null],
      ['long', s * JOINT.clampTo(pose.hipRotate || 0, JOINT.ROM.hipRotate), null],
    ]);
    // KNEE and ANKLE — hinges on the bone above, so they bend in the leg's
    // own plane however the leg is turned
    j(`shin${side}`, 'lateral', back ? (pose.kneeBack || 0) : (pose.knee || 0), JOINT.ROM.knee, 1);
    j(`foot${side}`, 'lateral', pose.ankle || 0, JOINT.ROM.ankle, 1);

    // the shrug is a translation, not a rotation — and absent means back to
    // rest, not "leave it"
    const c = bones[`clavicle${side}`];
    if (c && rest[`clavicle${side}_pos`]) {
      c.position.y = rest[`clavicle${side}_pos`].y + 0.035 * (pose.shoulderShrug || 0);
      c.updateMatrixWorld(true);
    }
  }
}

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
/* How far a camera has to stand from a box, along `eye`, for every corner of
 * it to land inside the frustum. Exact rather than approximate: a point sits
 * inside when its offsets across the view are within the frustum's half-widths
 * at its own depth, so each corner sets a minimum distance and the largest of
 * those wins. */
function fitDistance(box, centre, eye, camera) {
  const vTan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const hTan = vTan * Math.max(0.2, camera.aspect);
  const right = new THREE.Vector3().crossVectors(eye, new THREE.Vector3(0, 1, 0));
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
  right.normalize();
  const up = new THREE.Vector3().crossVectors(right, eye).normalize();
  const p = new THREE.Vector3();
  let need = 0.4;
  for (let i = 0; i < 8; i++) {
    p.set(i & 1 ? box.max.x : box.min.x,
      i & 2 ? box.max.y : box.min.y,
      i & 4 ? box.max.z : box.min.z).sub(centre);
    need = Math.max(need,
      p.dot(eye) + Math.abs(p.dot(right)) / hTan,
      p.dot(eye) + Math.abs(p.dot(up)) / vTan);
  }
  return need;
}

function restContacts(bones) {
  // Two points per foot, in the FOOT bone's own space: the floor under the
  // ankle, and the floor under the BALL. Two, because a calf raise pivots on
  // the ball and a squat sits on the whole sole — tracking one point put the
  // toes through the floor the moment the heel came up.
  //
  // BALL, not tip, and not `localToWorld(0, 1, 0)` — that is a point one METRE
  // along the foot bone, five times past the end of the foot. A calf raise
  // pivoting there lifted him 27 cm off the ground instead of 11. The ball of
  // the foot sits about 13 cm in front of the ankle on a 180 cm figure, and it
  // is the joint a heel actually rises over.
  const BALL = 0.13;
  const out = { z0: 0 };
  let z = 0; let n = 0;
  for (const side of ['L', 'R']) {
    const f = bones[`foot${side}`];
    if (!f) continue;
    const ankle = f.getWorldPosition(new THREE.Vector3());
    const toe = f.localToWorld(new THREE.Vector3(0, BALL, 0));
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
  let d = err();
  if (Math.abs(d) < 1e-4) return;
  // First step doubles as the sign check.
  obj.rotateOnWorldAxis(WORLD_X, -d);
  obj.updateMatrixWorld(true);
  if (Math.abs(err()) > Math.abs(d)) {
    obj.rotateOnWorldAxis(WORLD_X, 2 * d);
    obj.updateMatrixWorld(true);
  }
  // ...then converge. One step is exact only when the thing being turned lies
  // square to world X, and a stance is toed out: a calf raise asked for 34
  // degrees of plantarflexion and got 14, so he rose an inch onto his toes.
  for (let i = 0; i < 5; i++) {
    const e = err();
    if (Math.abs(e) < 2e-3) break;
    obj.rotateOnWorldAxis(WORLD_X, -e);
    obj.updateMatrixWorld(true);
    if (Math.abs(err()) > Math.abs(e)) {          // overshot: take it back
      obj.rotateOnWorldAxis(WORLD_X, e);
      obj.updateMatrixWorld(true);
      break;
    }
    d = e;
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
function hangFrom(root, bones, bar, grip) {
  const l = grip ? grip('L') : bones.handL;
  const r = grip ? grip('R') : bones.handR;
  if (!l || !r || !bar) return;
  // ALL THREE AXES. Pinning only the height let the hands drift forward as the
  // shoulder angle closed, so at the top of a pull-up he was holding thin air
  // a foot in front of the bar. The hands are the fixed point; the body is
  // what travels.
  // the GRIP, not the wrist: pinned by the hand bone the bar ran through his
  // forearm and the fingers hung in the air past it
  const m = (l.isBone ? l.getWorldPosition(new THREE.Vector3()) : l.clone())
    .add(r.isBone ? r.getWorldPosition(new THREE.Vector3()) : r.clone()).multiplyScalar(0.5);
  root.position.add(new THREE.Vector3(bar.x - m.x, bar.y - m.y, bar.z - m.z));
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
  // `depth` is how far the bone sits INSIDE the body from the surface it
  // rests on, measured along that surface's normal. It used to be a world
  // offset, which is the same thing only while the surface is level: on a
  // 30-degree incline the pad cut straight through his back.
  supine: { bone: 'chest', depth: 0.105, p: [0, 0.485, 0], n: [0, 1, 0] },
  incline30: { bone: 'chest', depth: 0.100, p: [0, 0.485, 0], n: [0, 0.866, 0.5] },
  prone: { bone: 'chest', depth: 0.105, p: [0, 0.485, 0], n: [0, 1, 0] },
  thrust: { bone: 'chest', depth: 0.105, p: [0, 0.485, 0], n: [0, 1, 0] },
  seated: { bone: 'pelvis', depth: 0.095, p: [0, 0.485, 0], n: [0, 1, 0] },
  'seated-back': { bone: 'pelvis', depth: 0.095, p: [0, 0.400, 0], n: [0, 1, 0] },
};

/* A bar that rests on the body decides where the hands must go, not the other
 * way round. Grip width and elbow direction are what actually distinguish a
 * back squat from a front rack, so they are the only two things this varies.
 *
 *   traps       hands out wide, elbows down and back, fingers over the bar
 *   front-rack  hands just outside the shoulders, elbows driven UP and forward,
 *               the bar carried on the delts with the fingers under it
 */
// a switch for the motion check, not for the app: ?debug=rig prints where
// each hand was ASKED to go and where it actually went
const RIG_DEBUG = typeof location !== 'undefined'
  && /(\?|&)debug=rig(&|$)/.test(location.search);

const GRIP_WIDTH = { traps: 2.60, 'front-rack': 1.15, 'floor-bar': 1.35 };

function reachToBar(bones, frames, barCentre, hold, fwd) {
  const up = new THREE.Vector3(0, 1, 0);
  // ALONG THE BAR, and the bar lies across the SHOULDERS — so measure the
  // lateral axis there, between the two of them. Deriving it from `fwd` put it
  // 25 degrees out, because `fwd` is the direction a toe points and a squat
  // stance is toed out; the right hand slid off the bar and forward, and that
  // arm came back across his chest.
  const shL = bones.upperarmL; const shR = bones.upperarmR;
  if (!shL || !shR) return;
  const lat = shL.getWorldPosition(new THREE.Vector3())
    .sub(shR.getWorldPosition(new THREE.Vector3()));
  lat.y = 0;
  if (lat.lengthSq() < 1e-6) return;
  lat.normalize();
  // and forward comes from the torso, not from a toe — see bodyAnterior()
  const ant = JOINT.bodyAnterior(bones, frames)
    || fwd.clone().addScaledVector(lat, -fwd.dot(lat)).normalize();
  const rack = hold === 'front-rack';
  const floor = hold === 'floor-bar';
  // HALF THE SHOULDER SPAN, once, for both hands — not each shoulder's own
  // distance to the bar. The bar sits a couple of centimetres off centre, and
  // measuring per side multiplied that by the grip factor into an eight
  // centimetre difference: one hand out by the plate, the other near the knurl.
  const span = Math.abs(
    shL.getWorldPosition(new THREE.Vector3())
      .sub(shR.getWorldPosition(new THREE.Vector3())).dot(lat)) / 2;
  if (span < 1e-4) return;
  const reach = span * (GRIP_WIDTH[hold] || 1.4);
  for (const side of ['L', 'R']) {
    const sh = bones[`upperarm${side}`];
    if (!sh) continue;
    const S = sh.getWorldPosition(new THREE.Vector3());
    const sign = Math.sign(S.clone().sub(barCentre).dot(lat)) || (side === 'L' ? 1 : -1);
    const out = lat.clone().multiplyScalar(sign);
    let target = barCentre.clone().addScaledVector(out, reach);
    // ...but never closer to the shoulder than a fully folded elbow reaches.
    // A front rack asked for a hand almost at its own shoulder, and the solver
    // obliged by folding the arm through itself into a pair of stumps.
    const dmin = JOINT.minReach(bones, side) * 1.03;
    if (target.distanceTo(S) < dmin) {
      target = JOINT.slideOut(S, barCentre, out, dmin) || target;
    }
    // where the elbow wants to be: hanging down and back under a squat bar,
    // driven forward and high under a front rack
    let pole;
    if (rack) pole = S.clone().addScaledVector(ant, 0.90).addScaledVector(up, 0.12);
    // hanging off a floor bar the elbow points down and a little outward, and
    // the arm is very nearly straight — the pole barely matters, but it must
    // not send the elbow forward into his own shins
    else if (floor) pole = S.clone().addScaledVector(up, -0.90).addScaledVector(out, 0.20);
    else pole = S.clone().addScaledVector(ant, -0.30).addScaledVector(up, -0.60);
    const got = JOINT.reachTo(bones, frames, side, target, pole);
    if (RIG_DEBUG) {
      const h = bones[`hand${side}`].getWorldPosition(new THREE.Vector3());
      console.log(`[rig] ${hold} ${side}`,
        'shoulder', S.toArray().map((v) => v.toFixed(3)).join(','),
        'target', target.toArray().map((v) => v.toFixed(3)).join(','),
        'hand', h.toArray().map((v) => v.toFixed(3)).join(','),
        'miss', h.distanceTo(target).toFixed(3), got);
    }
  }
}

function padContact(bones, stance, onFurniture = true, surface = null) {
  const cfg = PAD[stance];
  const b = cfg && bones[cfg.bone];
  if (!b) return null;
  // The equipment publishes the surface it offers; PAD's own numbers are the
  // fallback for anything that does not. Hand-written, they went stale the
  // moment the bench was rebuilt and the incline press floated above its pad.
  let p = surface ? surface.p.clone() : new THREE.Vector3(...cfg.p);
  const n = (surface ? surface.n.clone() : new THREE.Vector3(...cfg.n)).normalize();
  if (!onFurniture) { p = new THREE.Vector3(0, 0.02, 0); n.set(0, 1, 0); }
  const world = b.getWorldPosition(new THREE.Vector3()).addScaledVector(n, -cfg.depth);
  return { local: b.worldToLocal(world.clone()), bone: cfg.bone, p, n };
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
/* BALANCE — the ankle answers for the load.
 *
 * Posed from joint angles alone the figure's centre of mass can sit anywhere:
 * a squatter over his heels, a man holding a barbell out in front and not
 * moving an inch to answer for it. Nobody watching knows the physics and
 * everybody sees the result. So the combined centre of mass — body AND bar —
 * is computed, and a few degrees of ankle dorsiflexion bring it back over the
 * middle of the foot. That is the ankle strategy, the first thing a standing
 * person actually uses, and because the foot is planted the correction moves
 * everything above it and nothing below.
 */
function balance(root, bones, pose, contacts, fwd, base, load) {
  if (!contacts || !contacts.L) return 0;
  const midfoot = () => {
    const p = new THREE.Vector3();
    let n = 0;
    for (const side of ['L', 'R']) {
      const f = bones[`foot${side}`];
      if (!f || !contacts[side]) continue;
      p.add(f.localToWorld(contacts[side].heel.clone()))
        .add(f.localToWorld(contacts[side].toe.clone()));
      n += 2;
    }
    return n ? p.divideScalar(n) : p;
  };
  // RELATIVE to how he stands with nothing in his hands. The ankle joint sits
  // behind the middle of the foot, so a standing body's mass is always a few
  // centimetres back of it — chase that absolute number and the figure bows
  // forward permanently, which is what the first attempt did. What balance
  // actually is, is not DRIFTING from your own neutral as the load moves.
  // How far his mass has drifted from where it sits at rest, with the load
  // included. Measured against the neutral stance because the ankle joint sits
  // behind the middle of the foot — a standing body's mass is always a few
  // centimetres back of it, and chasing that absolute number bows the figure
  // forward permanently, which is what the first attempt did.
  const baseline = base.comErr != null ? base.comErr : 0;
  const drift = JOINT.centreOfMass(bones, load).sub(midfoot()).dot(fwd) - baseline;

  // THE TRUNK ANSWERS, NOT THE ANKLE. An ankle has about 25° to give and it
  // fights the ground solver, which re-plants the feet and moves the reference
  // along with the body — so the loop just walked to its clamp with nothing to
  // show. A lifter balances a loaded squat by leaning the trunk, and that is
  // both the real mechanism and the one with the authority.
  //
  // Bounded and proportional rather than solved: the segment masses here are
  // Dempster's fractions placed at bone heads, which is good enough to say
  // WHICH WAY and ROUGHLY HOW MUCH a load pulls him, and not good enough to
  // claim a true centre of mass. What it buys is the thing that was missing —
  // the lean answers to the load and to the depth instead of being a constant.
  const lean = THREE.MathUtils.clamp(-drift * 34, -13, 13);
  if (Math.abs(lean) > 0.15) {
    settle(root, bones, { ...pose, spine: (pose.spine || 0) + lean }, contacts, fwd, base);
    JOINT.hinge(bones.spine, base.restSpine, base.frameSpine, 'lateral',
      -((pose.spine || 0) + lean), JOINT.ROM.spine);
  }
  return lean;
}

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
  phase: frozen = null, view = 'three-quarter', chrome = true, focus = null }) {
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
    // ACES, not linear: three lamps and a linear response is what makes a
    // real-time figure look like plastic. A film response curve rolls the
    // highlights off the way skin actually behaves.
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

    // IMAGE-BASED LIGHT. The single biggest step from "3D model" to
    // "photograph of a person": every point on the skin gathers light from a
    // whole room instead of from three lamps, so the shoulders, the ribs and
    // the inside of an arm are all lit differently and correctly. Generated,
    // not downloaded — no asset to ship and nothing to go stale.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.62;

    const key = new THREE.DirectionalLight(0xfff2e2, 2.3);
    key.position.set(2.4, 3.4, 2.2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 12;
    key.shadow.camera.left = -1.6;
    key.shadow.camera.right = 1.6;
    key.shadow.camera.top = 2.6;
    key.shadow.camera.bottom = -0.6;
    key.shadow.bias = -0.0012;
    key.shadow.normalBias = 0.018;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xbcd4ff, 0.45);
    fill.position.set(-2.6, 1.4, 1.8);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0x9fdcff, 1.15);
    rim.position.set(-1.6, 2.2, -2.8);
    scene.add(rim);

    // A body with no shadow floats. This plane shows nothing but the shadow
    // that lands on it, so the card's own background still shows through.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 6),
      new THREE.ShadowMaterial({ opacity: 0.34 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

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
        o.castShadow = true;
        o.receiveShadow = true;
        const wasArray = Array.isArray(o.material);
        const mats = wasArray ? o.material : [o.material];
        const tinted = mats.map((m) => {
          const group = (m.name || '').replace(/^mus_/, '');
          const lit = primary.has(group) ? PRIMARY : secondary.has(group) ? SECONDARY : null;
          // SKIN, physically. Sheen is the peach-fuzz rim you see on a real
          // arm against a light; the low specular and high-ish roughness stop
          // it reading as wet plastic; the faint red emissive stands in for
          // subsurface scatter, which is what makes skin look alive and is far
          // too expensive to compute per pixel on a phone.
          const mat = new THREE.MeshPhysicalMaterial({
            // Ambient occlusion is baked into the mesh as a vertex colour, and
            // vertexColors multiplies it into the base — so the creases, the
            // armpit, the line under the pec all darken the way they do on a
            // real body, with no texture to ship.
            vertexColors: true,
            color: (group === 'frame' ? SKIN_DEEP : SKIN).clone(),
            roughness: 0.58,
            metalness: 0.0,
            sheen: 0.5,
            sheenRoughness: 0.75,
            sheenColor: new THREE.Color(0xffd9c4),
            specularIntensity: 0.32,
            envMapIntensity: 0.95,
            emissive: SUBSURFACE.clone(),
            emissiveIntensity: 0.055,
          });
          mat.name = m.name;
          if (lit) {
            // A lit muscle is skin TINTED, not skin replaced. Emissive is
            // unlit by definition, so leaning on it flattened the highlight
            // into a pastel sticker with no form at all — the shoulder and the
            // rib underneath it came out the same flat pink. Most of the
            // highlight now rides on sheen, which is view-dependent and so
            // keeps the shading, with just enough emissive to lift it.
            // The base takes a DEEPER version of the highlight — the token
            // colours are already light, so tinting light skin with them gave
            // a pastel sticker with no shading. The brightness rides on sheen,
            // which is view-dependent and so still shows the form underneath.
            mat.color.lerp(lit.clone().multiplyScalar(0.52), 0.88);
            mat.emissive = lit.clone();
            mat.emissiveIntensity = 0.10;
            mat.sheen = 0.95;
            mat.sheenColor = lit.clone();
            mat.sheenRoughness = 0.38;
            mat.roughness = 0.44;
            mat.envMapIntensity = 0.62;
          }
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
        root.position.set(0, BENCH_TOP, 0.30);
      } else if (stance === 'incline30') {
        root.rotation.x = -Math.PI / 2 + THREE.MathUtils.degToRad(30);
        root.position.set(0, BENCH_TOP + 0.10, 0.20);
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
      // measured with the skeleton untouched, so a hinge can turn about an
      // axis that belongs to its limb rather than to the room
      const frames = JOINT.restFrames(bones, root);
      // and the corrective shapes, found once — declared here because the
      // framing pass poses the figure and needs them too
      const corrective = JOINT.correctiveTargets(root);
      // where the load actually sits, and how heavy it is relative to him —
      // so a bar on the back leans him forward and a light dumbbell does not
      /* WHEN THE BAR IS ON THE FLOOR, THE FLOOR IS CARRYING IT.
       *
       * Balance leans the trunk away from a load held in front — correct while
       * he is holding it, and wrong at the bottom of a deadlift, where the bar
       * is still on the ground and he has not taken its weight yet. The solver
       * was leaning him back off a bar he was not yet carrying, which is
       * exactly what stopped his shoulders getting over it.
       *
       * So the load transfers as the bar breaks the floor. Driven by HIP
       * EXTENSION, not by the bar's own height — that was circular: the bar
       * sat high because balance leaned him back, balance leaned him back
       * because the load read as borne, and the load read as borne because the
       * bar sat high. The hips are the thing that actually breaks a bar off
       * the ground, and they are known before any of this is placed.
       *
       * Over the first quarter of the pull, because once a bar is moving the
       * lifter has all of it.
       */
      const startHip = (pat && PATTERNS[pat]?.start?.hip) || 0;
      const loadOf = (sp, bs, id, po) => {
        const mass = JOINT.LOAD_MASS[id] || 0;
        if (!mass) return null;
        const ride = anchor[sp.hold];
        const at = ride && bs.chest ? bs.chest.localToWorld(ride.clone())
          : (gripPoint('L') && gripPoint('R')
            ? gripPoint('L').add(gripPoint('R')).multiplyScalar(0.5) : null);
        if (!at) return null;
        if (!sp.floorRests || !startHip) return { mass, at };
        const pulled = 1 - ((po?.hip || 0) / startHip);       // 0 at the floor
        const borne = Math.max(0, Math.min(1, pulled / 0.25));
        return borne > 0 ? { mass: mass * borne, at } : null;
      };

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
      // Where a bar RIDES the body — across the traps, or racked on the front
      // delts. Anchored in the chest bone's own space, worked out once from the
      // rest pose, so the bar follows the torso through the lift instead of
      // hanging at a fixed world height while the man squats away beneath it.
      // Where a hand actually holds something: the middle of the closed fist,
      // not the wrist and not the midpoint between the two hands. A bar placed
      // at the hand BONE passes behind the fingers, which is what it had been
      // doing.
      const gripPoint = (sideTag) => {
        const h = bones[`hand${sideTag}`];
        if (!h) return null;
        const a = h.getWorldPosition(new THREE.Vector3());
        // the middle finger's knuckle IS the grip: a bar crosses the palm
        // there, and the fingers close over it from that line
        const k = bones[`middle1${sideTag}`] || bones[`index1${sideTag}`];
        if (!k) return a;
        return a.lerp(k.getWorldPosition(new THREE.Vector3()), 0.92);
      };
      const anchor = {};
      const bodyUp = new THREE.Vector3(0, 1, 0)
        .applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion())).normalize();
      if (bones.chest) {
        // measured off the body, not written as coordinates: a front rack is
        // "in front of the collarbones", and hardcoding +Z for that put the bar
        // behind his head
        const c = bones.chest.getWorldPosition(new THREE.Vector3());
        anchor.traps = bones.chest.worldToLocal(
          c.clone().addScaledVector(bodyUp, 0.190).addScaledVector(fwd, -0.055));
        anchor['front-rack'] = bones.chest.worldToLocal(
          c.clone().addScaledVector(bodyUp, 0.140).addScaledVector(fwd, 0.105));
      }

      const baseTransform = {
        pos: root.position.clone(), quat: root.quaternion.clone(), floor: 0,
        pitch: { L: footPitch(bones, 'L', fwd), R: footPitch(bones, 'R', fwd) },
      };
      // how his own mass sits over his feet with nothing in his hands — the
      // zero that balance is measured against
      baseTransform.restSpine = rest.spine;
      baseTransform.frameSpine = frames.spine;
      baseTransform.comErr = (() => {
        const p = new THREE.Vector3();
        let n = 0;
        for (const side of ['L', 'R']) {
          const f = bones[`foot${side}`];
          if (!f || !contacts[side]) continue;
          p.add(f.localToWorld(contacts[side].heel.clone()))
            .add(f.localToWorld(contacts[side].toe.clone()));
          n += 2;
        }
        if (!n) return 0;
        return JOINT.centreOfMass(bones, null).sub(p.divideScalar(n)).dot(fwd);
      })();

      // equipment
      const eq = equipmentFor(name, pat);
      const spec = (RIG[eq] || JOINT.none)();
      // Where the equipment says its surface is, in world terms — and declared
      // HERE, after `spec` exists. Reaching for it earlier is the same
      // temporal-dead-zone trap that has cost this file three sessions:
      // a bare ReferenceError, an empty panel, and a clean-looking console.
      const surface = (() => {
        const u = spec.obj?.userData?.pad;
        if (!u) return null;
        return { p: u.p.clone().add(spec.obj.position), n: u.n.clone() };
      })();
      const pad = PAD[stance] ? padContact(bones, stance, onFurniture, surface) : null;
      const hand = pat ? gripFor(pat, eq) : { grip: 0.18, forearmTwist: 0, wrist: 0 };
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
            const po = Object.assign(poseAt(pat, ph), hand);
            JOINT.applyCorrectives(corrective, po);
            applyPose(bones, rest, frames, po, restAbduct);
            JOINT.secondary(bones, rest, frames, po, {}, ph);
            if (GROUNDED) {
              settle(root, bones, po, contacts, fwd, baseTransform);
              balance(root, bones, po, contacts, fwd, baseTransform, loadOf(spec, bones, eq, po));
            }
            else if (pad) rest_on(root, bones, pad);
            else if (spec.hangAt) hangFrom(root, bones, spec.hangAt, gripPoint);
            JOINT.levelGaze(bones, frames);
            for (const side of ['L', 'R']) JOINT.plumbUpperArm(bones, frames, side, po);
          }
          box.union(new THREE.Box3().setFromObject(root));
          // ...and what the hands are holding. Framed on the body alone, an
          // overhead press pushed its bar clean out of the top of the picture
          // at exactly the moment the lift is about.
          for (const side of ['L', 'R']) {
            const h = bones[`hand${side}`];
            if (h) box.expandByPoint(h.getWorldPosition(new THREE.Vector3()));
          }
          if (bones.chest && anchor[spec.hold]) {
            box.expandByPoint(bones.chest.localToWorld(anchor[spec.hold].clone()));
          }
        }
        // A plate is 450 mm across, so leave its radius ABOVE and BELOW the
        // hands — an overhead press must not have its bar clipped at the top.
        // Sideways, no: the bar is 2.2 m of steel and framing all of it shrinks
        // the lifter to nothing. A photograph of a squat lets the plates run
        // off the edges, and so does this.
        if (spec.obj && !spec.prop) box.expandByVector(new THREE.Vector3(0.06, 0.23, 0.06));
        let c = box.getCenter(new THREE.Vector3());
        const DIR = {
          'three-quarter': [1.15, 0.45, 1.75],
          front: [0.0, 0.30, 2.1],
          side: [2.1, 0.30, 0.0],
          back: [0.0, 0.30, -2.1],
        }[view] || [1.15, 0.45, 1.75];
        const eye = new THREE.Vector3(...DIR).normalize();
        // How far back the camera has to stand for the whole box to be inside
        // the frustum — worked out from the frustum, not from a factor on the
        // box's longest side. That factor was tuned on standing lifts, where a
        // held bar adds a quarter metre of slack in every direction; the lifts
        // that sit or lie down get no such expansion, and it cropped their
        // heads and feet off in every recording.
        let radius = fitDistance(box, c, eye, camera) * 1.06;
        // `focus` frames one joint instead of the whole body. A wrist that does
        // not work is invisible at full height and obvious at arm's length,
        // and the check has to be able to get close enough to see it.
        if (focus && bones[focus]) {
          c = bones[focus].getWorldPosition(new THREE.Vector3());
          radius = 0.26;
        }
        controls.target.copy(c);
        camera.position.copy(c).addScaledVector(eye, radius);
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
      const clock = new THREE.Clock();
      const period = 3.4;   // one controlled rep
      const tmp = new THREE.Vector3();
      const tick = () => {
        raf = requestAnimationFrame(tick);
        const phase = frozen != null ? frozen : (pat ? (clock.getElapsedTime() % period) / period : 0);
        if (pat) {
          const pose = Object.assign(poseAt(pat, phase), hand);
          // how fast each joint is moving THROUGH THE REP, not through the
          // clock — so a frozen frame in the motion sheet shows the same
          // secondary motion the moving figure has
          const back = poseAt(pat, (phase + 0.98) % 1);
          const dPose = {};
          for (const k of Object.keys(pose)) {
            if (typeof pose[k] === 'number' && typeof back[k] === 'number') dPose[k] = pose[k] - back[k];
          }
          // from the same starting transform every frame, or the corrections
          // below compound and the figure walks out of shot
          root.position.copy(baseTransform.pos);
          root.quaternion.copy(baseTransform.quat);
          root.updateMatrixWorld(true);
          JOINT.applyCorrectives(corrective, pose);
          applyPose(bones, rest, frames, pose, restAbduct);
          JOINT.secondary(bones, rest, frames, pose, dPose, phase);
          if (GROUNDED) {
            settle(root, bones, pose, contacts, fwd, baseTransform);
            balance(root, bones, pose, contacts, fwd, baseTransform, loadOf(spec, bones, eq, pose));
          }
          else if (pad) rest_on(root, bones, pad);
          else if (spec.hangAt) hangFrom(root, bones, spec.hangAt, gripPoint);
          // last, because they answer to where the trunk ACTUALLY ended up
          JOINT.levelGaze(bones, frames);
          for (const side of ['L', 'R']) JOINT.plumbUpperArm(bones, frames, side, pose);
        }

        // put whatever is held where the hands are
        for (const obj of held) {
          const hand = obj.userData.hand;
          if (hand) {
            const p = gripPoint(hand);
            if (p) { obj.position.copy(p); obj.quaternion.identity(); }
          } else {
            const a = gripPoint('L'); const b2 = gripPoint('R');
            if (a && b2) {
              obj.position.copy(a).add(b2).multiplyScalar(0.5);
              const ride = anchor[spec.hold];
              if (ride && bones.chest) {
                obj.position.copy(bones.chest.localToWorld(ride.clone()));
                // The bar is placed by where it SITS — on the traps, on the
                // front delts — so now the hands have to come to it. Posed by
                // angle alone they sat in front of his chest with the fingers
                // open and the bar floating behind his head.
                reachToBar(bones, frames, obj.position, spec.hold, fwd);
              }
              // A loaded bar rests on its plates: it cannot go below their
              // radius, and at the bottom of a deadlift it should be sitting
              // on the floor rather than sunk into it.
              // A LOADED BAR RESTS ON ITS PLATES. It cannot go below their
              // radius — and when it stops there, the hands are what move: a
              // deadlift starts from a bar that is already on the floor, so he
              // reaches down to it rather than it floating up to meet him.
              if (spec.floorRests && obj.position.y < 0.225) {
                obj.position.y = 0.225;
                reachToBar(bones, frames, obj.position, 'floor-bar', fwd);
                const a2 = gripPoint('L'); const b3 = gripPoint('R');
                if (a2 && b3) obj.position.copy(a2).add(b3).multiplyScalar(0.5);
              }
              // ...and it lies along the line between the two fists. Left
              // world-horizontal, one hand higher than the other left the bar
              // passing through neither of them.
              obj.quaternion.identity();
              if (!ride) {
                const axis = b2.clone().sub(a);
                if (axis.lengthSq() > 1e-6) {
                  obj.quaternion.setFromUnitVectors(new THREE.Vector3(-1, 0, 0), axis.normalize());
                }
              }
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
    }).catch((err) => {
      // This used to swallow the reason, so a plain ReferenceError in the
      // setup showed up as an empty panel with a clean console.
      console.error('[Body3D] could not build the figure', err);
      setState('error');
    });

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
      pmrem.dispose();
      envRT.dispose();
      renderer.dispose();
      // dispose() frees three.js's own objects but NOT the WebGL context, and a
      // browser keeps only about sixteen. Every opened-and-closed exercise
      // sheet leaked one, so after a dozen the figure simply stopped drawing —
      // a white panel, no error. The motion sheet hit it first because React's
      // StrictMode mounts each card twice.
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
    };
  }, [muscles, pat, name, height, frozen, view, focus]);

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
