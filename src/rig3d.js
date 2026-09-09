// THE JOINTS — what each one IS, which way it turns, and how far it goes.
//
// Hayden, 9 Sep 2026: "the models elbows are bent like spaghetti rather than
// looking like they are the arms of a real person… every other bone joint and
// possible area for articulation… should all be able to rotate and move in a
// completely realistic and anatomically accurate way."
//
// He is describing two faults with one cause.
//
// FIRST: every joint was rotated about one of the BODY's axes. That is right
// for the hip and the shoulder, which hang off the trunk, and wrong for every
// joint further down a limb. An elbow is a HINGE, and a hinge's axis is fixed
// to the bone above it — it runs through the humerus from one epicondyle to
// the other and travels with the arm. Abduct the shoulder 45° and the elbow's
// axis abducts with it. Rotating the forearm about the body's lateral axis
// instead swings it through a plane the elbow does not have, which is exactly
// what a limb made of spaghetti looks like.
//
// So each joint's axes are taken ONCE, at rest, in the frame of its PARENT
// bone, and every rotation afterwards is expressed in them. A hinge then
// follows its limb, because that is what being fixed to the limb means.
//
// SECOND: nothing was bounded. An elbow that can pass -30° or 200° will, at
// some phase of some lift, and no amount of correct axes saves it. Every joint
// here carries the range of motion a real one has, and is clamped to it.
// Ranges are the functional ones — what a healthy adult reaches under load —
// not the passive maxima a physiotherapist can force.

import * as THREE from 'three';

const D = THREE.MathUtils.degToRad;

// ---------------------------------------------------------------- ranges ---
// [min, max] in degrees. Positive is the first-named direction.
export const ROM = {
  spine: [-20, 55],         // flexion; extension is the negative side
  spineSide: [-30, 30],
  spineTwist: [-35, 35],
  chest: [-15, 35],
  neck: [-45, 55],
  neckTurn: [-70, 70],

  shoulder: [-55, 180],     // flexion
  shoulderAbduct: [-30, 180],
  shoulderRotate: [-90, 90],// external positive
  elbow: [-5, 150],         // a straight arm is 0; -5 is the hyperextension most people have
  forearmTwist: [-85, 85],  // pronation positive
  wrist: [-75, 80],         // flexion positive, extension negative
  wristDeviate: [-20, 35],

  hip: [-25, 130],          // flexion positive
  hipAbduct: [-30, 48],
  hipRotate: [-45, 45],
  knee: [-3, 150],
  ankle: [-52, 28],         // dorsiflexion positive, plantarflexion negative
  ankleInvert: [-25, 25],

  // per digit, per joint
  mcp: [-30, 95],
  pip: [0, 115],
  dip: [0, 85],
  thumbCmc: [-15, 55],
  thumbMcp: [0, 60],
};

export function clampTo(deg, range) {
  if (!range) return deg;
  return Math.min(range[1], Math.max(range[0], deg));
}

/* ------------------------------- rest frames ------------------------------
 * For every bone, the body's three anatomical directions expressed in that
 * bone's PARENT's rest frame, plus the bone's own long axis. Measured once,
 * with the skeleton untouched — after that a hinge can be turned about an axis
 * that belongs to the limb rather than to the room.
 */
export function restFrames(bones, root) {
  const q = root ? root.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
  const bodyX = new THREE.Vector3(1, 0, 0).applyQuaternion(q);   // lateral
  const bodyY = new THREE.Vector3(0, 1, 0).applyQuaternion(q);   // long / up
  const bodyZ = new THREE.Vector3(0, 0, 1).applyQuaternion(q);   // anterior
  const frames = {};
  for (const [name, b] of Object.entries(bones)) {
    const pq = new THREE.Quaternion();
    if (b.parent) b.parent.getWorldQuaternion(pq);
    const inv = pq.invert();
    frames[name] = {
      lateral: bodyX.clone().applyQuaternion(inv).normalize(),
      up: bodyY.clone().applyQuaternion(inv).normalize(),
      anterior: bodyZ.clone().applyQuaternion(inv).normalize(),
      // the bone's own direction: a Blender bone runs along its local +Y
      long: new THREE.Vector3(0, 1, 0),
    };
  }
  return frames;
}

/* --------------------------------- turning -------------------------------- */

// Set a bone to its rest pose plus a rotation about ONE axis of its parent's
// rest frame. Zero is a pose, not an absence — a joint returning to neutral
// must actually return, or it keeps whatever it was last given and the figure
// drifts a little further from anatomy every frame.
export function hinge(bone, rest, frame, axisName, deg, range) {
  if (!bone || !rest) return;
  bone.quaternion.copy(rest);
  const a = clampTo(deg || 0, range);
  if (a) {
    const axis = frame && frame[axisName] ? frame[axisName] : new THREE.Vector3(1, 0, 0);
    bone.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, D(a)));
  }
  bone.updateMatrixWorld(true);
}

// A ball joint: several rotations composed in one parent frame, in the order a
// clinician measures them — flexion, then abduction, then rotation about the
// limb. Composed the other way round, an abducted arm flexes sideways.
export function ball(bone, rest, frame, spec) {
  if (!bone || !rest) return;
  const q = new THREE.Quaternion();
  for (const [axisName, deg, range] of spec) {
    const a = clampTo(deg || 0, range);
    if (!a) continue;
    const axis = axisName === 'long' ? new THREE.Vector3(0, 1, 0)
      : (frame && frame[axisName]) ? frame[axisName] : new THREE.Vector3(1, 0, 0);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(axis, D(a)));
  }
  bone.quaternion.copy(q).multiply(rest);
  bone.updateMatrixWorld(true);
}

// Roll about the bone's OWN length — pronation, and the rotation component of
// a shoulder. Not expressible in the body's planes: the radius crosses the
// ulna along the forearm, it does not swing through one.
export function roll(bone, deg, range) {
  if (!bone) return;
  const a = clampTo(deg || 0, range);
  if (!a) return;
  bone.quaternion.multiply(new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(0, 1, 0), D(a)));
  bone.updateMatrixWorld(true);
}

/* --------------------------------- digits ---------------------------------
 * Five fingers, each with its own knuckle, and each bending at three joints.
 * A hand that closes as one mitten is convincing on a barbell and nowhere
 * else; a rope, an open palm, a hook grip and a thumbless grip all read as
 * the same shape. `curl` is 0 → 1 and the joints are driven from it in the
 * proportions a real hand closes in: the knuckle leads, the middle joint
 * follows hardest, the tip last.
 */
export const DIGITS = ['thumb', 'index', 'middle', 'ring', 'little'];

// how much of the total curl each joint of each digit takes
const DIGIT_CURL = {
  thumb: [0.42, 0.55, 0.0],
  index: [0.72, 1.0, 0.62],
  middle: [0.78, 1.05, 0.66],
  ring: [0.76, 1.02, 0.64],
  little: [0.70, 0.95, 0.60],
};
// fingers do not close in a flat plane — they converge toward the middle
const DIGIT_SPREAD = { thumb: -26, index: 7, middle: 0, ring: -6, little: -13 };

export function closeHand(bones, rest, frames, side, curl, spread = 1) {
  const c = Math.max(0, Math.min(1, curl || 0));
  for (const d of DIGITS) {
    const share = DIGIT_CURL[d];
    const isThumb = d === 'thumb';
    const joints = isThumb
      ? [[`${d}1${side}`, ROM.thumbCmc, 55], [`${d}2${side}`, ROM.thumbMcp, 60]]
      : [[`${d}1${side}`, ROM.mcp, 95], [`${d}2${side}`, ROM.pip, 115], [`${d}3${side}`, ROM.dip, 85]];
    joints.forEach(([name, range, full], i) => {
      const b = bones[name];
      if (!b) return;
      // Clamp the FLEXION, then turn it into a rotation — the same trap as the
      // elbow. Clamped against the rotation, 68° of knuckle flexion came out
      // as 30° and the two joints past it as ZERO, so a pull-up gripped the
      // bar with a flat open hand.
      const flex = clampTo(c * full * (share[i] ?? 0), range);
      hinge(b, rest[name], frames[name], 'lateral', -flex, null);
      // the sideways set of a finger: the resting splay closes as the hand does
      if (i === 0 && DIGIT_SPREAD[d]) {
        b.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0), D(DIGIT_SPREAD[d] * (1 - c) * spread)));
        b.updateMatrixWorld(true);
      }
    });
  }
}

/* ------------------------------ SECONDARY MOTION --------------------------
 * What a body does that is not the lift.
 *
 * Hayden, 9 Sep 2026: the figure should move "as though it were a real human
 * performing each movement as a video rather than a 3-D model". Joints alone
 * never get there, because a person under load is doing four other things at
 * the same time and a puppet is doing none of them:
 *
 *   SCAPULAR RHYTHM.   The shoulder blade is not a spectator. Past about 30°
 *                      of humeral elevation it rotates upward roughly 1° for
 *                      every 2° the arm rises — the scapulohumeral rhythm —
 *                      and it protracts to finish a press and retracts to
 *                      finish a row. An arm that goes overhead on a frozen
 *                      shoulder girdle is the clearest puppet tell there is.
 *   HEAD STABILISATION. Eyes hold the horizon. When the torso pitches forward
 *                      into a hinge the neck gives most of it back, so the
 *                      gaze stays roughly level. A head welded to the chest
 *                      reads as a mannequin on a stick.
 *   SOFT TISSUE LAGS.  Flesh has mass. It arrives after the bone does and
 *                      settles once the bone stops. This is small — a few
 *                      degrees — and it is most of what separates "animated"
 *                      from "filmed".
 *   BREATHING.         Under a heavy set nobody breathes freely: the ribs lift
 *                      on the way down and the breath is held on the way up.
 *                      Braced, not idle — which is itself the tell.
 *
 * All of it is driven from the pose and its RATE OF CHANGE with respect to the
 * rep, not from wall-clock time. That keeps it deterministic, and it means a
 * frozen frame in the motion sheet shows the same secondary motion the moving
 * figure has — a still that lies about this would be worse than none.
 */
// SCAPULOHUMERAL RHYTHM, and why it cannot simply be added on top.
//
// Raising an arm is a shared job: past about 30° the shoulder blade rotates
// upward and contributes roughly a third of the total, while the humerus does
// the rest. The pose data says how high the ARM is relative to the trunk —
// which is the total — so the scapula's share has to be taken OUT of the
// humerus, not stacked on it. Added on top, an overhead press stopped going
// overhead: 42° of scapula plus the full shoulder angle rotated the whole arm
// chain past the pose and the bar came down instead of up.
//
// Doing it properly is also what keeps the deltoid intact at high elevation:
// the glenoid turns to face the arm instead of the humerus hinging against a
// fixed socket.
export function scapularShare(pose) {
  const elev = Math.max(pose.shoulder || 0, pose.shoulderAbduct || 0);
  const scap = Math.min(45, Math.max(0, elev - 30) * 0.34);
  return { scap, keep: elev > 1e-6 ? (elev - scap) / elev : 1 };
}

export function secondary(bones, rest, frames, pose, dPose, phase = 0) {
  if (!pose) return;
  const q = (axis, deg) => new THREE.Quaternion().setFromAxisAngle(axis, D(deg));
  const add = (name, axisName, deg) => {
    const b = bones[name];
    const f = frames[name];
    if (!b || !f || !deg) return;
    b.quaternion.premultiply(q(f[axisName] || f.lateral, deg));
    b.updateMatrixWorld(true);
  };

  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1;
    // The protraction that finishes a press and the retraction that finishes a
    // row. Small, and genuinely separate from elevation — unlike the upward
    // rotation, which is NOT added here: see scapularShare().
    const protract = Math.max(-1, Math.min(1, (pose.shoulder || 0) / 110));
    add(`clavicle${side}`, 'up', s * protract * 8);

    // the flesh of the upper arm and thigh arrives after the bone
    add(`deltoid${side}`, 'lateral', clampTo(-(dPose.shoulder || 0) * 0.055, [-4, 4]));
    add(`thigh${side}`, 'lateral', clampTo((dPose.hip || 0) * 0.035, [-3, 3]));
    add(`forearm${side}`, 'lateral', clampTo(-(dPose.elbow || 0) * 0.045, [-3.5, 3.5]));
  }

  // the eyes hold the horizon: the neck gives back most of the torso's pitch
  const pitch = (pose.spine || 0) + (pose.chest || 0);
  add('neck', 'lateral', clampTo(pitch * 0.42, [-40, 40]));
  add('head', 'lateral', clampTo(pitch * 0.28, [-30, 30]));

  // braced breathing: the ribs lift through the lowering half and hold through
  // the drive, which is what a working set actually looks like
  const rise = Math.sin(Math.PI * 2 * phase) * 0.5 + 0.5;
  add('chest', 'lateral', -1.6 * rise);
}
