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

/* HOW A HAND IS ACTUALLY HOLDING THE THING.
 *
 * Closing all five digits from one number gets a barbell right and everything
 * else wrong: a hook grip, a thumbless press, a rope, an open machine handle
 * and a flat palm all come out as the same fist. These are the shapes a lifter
 * actually makes, as per-digit multipliers on that one curl — so the hand is
 * still driven by one value, but the five fingers no longer have to agree.
 *
 * The thumb is the reason this matters. It does not fold in the fingers' plane
 * at all; it swings ACROSS the palm to meet them, and how far it comes is the
 * entire difference between a grip that is locked and one that is resting on
 * the bar.
 */
export const GRIP_STYLE = {
  // fingers wrapped, thumb over them — the default for a bar or a dumbbell
  full: { per: {}, oppose: 1.0 },
  // the thumb goes UNDER the fingers and they close on it: a heavy deadlift
  hook: { per: { thumb: 1.35, index: 1.06, middle: 1.06 }, oppose: 1.25, under: true },
  // thumb alongside the bar, not around it — a bench press habit
  thumbless: { per: { thumb: 0.12 }, oppose: 0.08 },
  // a rope has nothing rigid in it, so the fingers close further and the
  // thumb meets them rather than lying over a bar
  rope: { per: { thumb: 1.1, little: 1.12, ring: 1.06 }, oppose: 1.15 },
  // a machine handle or a flat palm: barely closed at all
  open: { per: {}, scale: 0.14, oppose: 0.3 },
  // hanging from a bar: fingers do almost all of it, thumb along the bar
  hang: { per: { thumb: 0.5, index: 1.1, middle: 1.12, ring: 1.1, little: 1.05 }, oppose: 0.55 },
};

export function closeHand(bones, rest, frames, side, curl, style = 'full', spread = 1) {
  const st = GRIP_STYLE[style] || GRIP_STYLE.full;
  const c = Math.max(0, Math.min(1, (curl || 0) * (st.scale != null ? st.scale : 1)));
  const s = side === 'L' ? 1 : -1;
  for (const d of DIGITS) {
    const share = DIGIT_CURL[d];
    const mult = (st.per && st.per[d]) || 1;
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
      const flex = clampTo(c * full * (share[i] ?? 0) * mult, range);
      hinge(b, rest[name], frames[name], 'lateral', -flex, null);
      if (i > 0) return;
      const f = frames[name];
      if (!f) return;
      if (isThumb) {
        // OPPOSITION. A thumb does not fold in the fingers' plane; it swings
        // across the palm to meet them, and how far it comes is the whole
        // difference between a locked grip and a hand resting on a bar.
        const across = (st.oppose != null ? st.oppose : 1) * (34 + 26 * c);
        b.quaternion.multiply(new THREE.Quaternion()
          .setFromAxisAngle(f.anterior, D(-s * across)));
        if (st.under) {
          // a hook grip tucks it under the fingers before they close on it
          b.quaternion.multiply(new THREE.Quaternion()
            .setFromAxisAngle(new THREE.Vector3(0, 1, 0), D(s * 22 * c)));
        }
      } else if (DIGIT_SPREAD[d]) {
        // the resting splay of the fingers closes as the hand does
        b.quaternion.multiply(new THREE.Quaternion()
          .setFromAxisAngle(new THREE.Vector3(0, 1, 0), D(DIGIT_SPREAD[d] * (1 - c) * spread)));
      }
      b.updateMatrixWorld(true);
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
  // Anatomically the scapula takes about a third of full elevation — 60 of 180.
  //
  // This used to be capped at 25 on the belief that the trap and upper chest
  // tore into a sail past that. They do not: rendering the identical lockout
  // frame at 25 and at 50 shows the SAME artifacts, and so does the model as
  // it stood before any of it. What actually breaks up at extreme overhead
  // elevation is a weight discontinuity between adjacent muscle groups, which
  // is there at every scapular angle and is not the scapula's doing. So the
  // cap goes back to something near the anatomical share; held a little under
  // 60 because the humerus is the joint whose corrective shape was built at
  // its own full range, and it is the one to trust with the remainder.
  const scap = Math.min(50, Math.max(0, elev - 30) * 0.34);
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

  // The eyes hold the horizon — but see levelGaze(): the pose's own spine
  // value is only PART of the trunk's pitch, because the balance solver leans
  // the trunk too. A front rack leans him back to sit under the load, and this
  // estimate then had him staring at the ceiling for the whole set.

  // braced breathing: the ribs lift through the lowering half and hold through
  // the drive, which is what a working set actually looks like
  const rise = Math.sin(Math.PI * 2 * phase) * 0.5 + 0.5;
  add('chest', 'lateral', -1.6 * rise);
}


/* --------------------------- CORRECTIVE SHAPES ----------------------------
 * Linear blend skinning averages rotations, and an average always falls INSIDE
 * the arc a surface should follow — so a bent joint loses volume. An elbow at
 * 135° pinches to a crease, a shoulder overhead flattens, a deep knee caves.
 * Better weights cannot fix it, because it is not a weighting error.
 *
 * `tools/anatomy/build.py` bakes one corrective per joint per side: the
 * difference between volume-preserving skinning and linear skinning, captured
 * at the extreme pose. Here they are blended back in as the joint approaches
 * that pose — nothing below the onset, full weight at the extreme, and a
 * smoothstep between so the correction never appears as a step.
 */
const CORRECTIVE = {
  shoulder_up: { of: (p) => Math.max(p.shoulder || 0, p.shoulderAbduct || 0), onset: 65, full: 150 },
  elbow_deep: { of: (p) => p.elbow || 0, onset: 55, full: 135 },
  knee_deep: { of: (p) => p.knee || 0, onset: 55, full: 130 },
  hip_deep: { of: (p) => -(p.hip || 0), onset: 45, full: 105 },
};

// Find every skinned mesh's morph targets once, so the per-frame work is a
// handful of array writes rather than a search.
export function correctiveTargets(root) {
  const found = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.morphTargetDictionary || !o.morphTargetInfluences) return;
    for (const [name, idx] of Object.entries(o.morphTargetDictionary)) {
      const m = /^([a-z_]+)_(L|R)$/.exec(name);
      if (m && CORRECTIVE[m[1]]) found.push({ mesh: o, idx, key: m[1] });
    }
  });
  return found;
}

export function applyCorrectives(targets, pose) {
  if (!targets || !targets.length || !pose) return;
  for (const t of targets) {
    const c = CORRECTIVE[t.key];
    const a = c.of(pose);
    const u = Math.max(0, Math.min(1, (a - c.onset) / (c.full - c.onset)));
    t.mesh.morphTargetInfluences[t.idx] = u * u * (3 - 2 * u);
  }
}

/* --------------------------- BALANCE AND WEIGHT ---------------------------
 * A lifter does not stand still under a load; they stand OVER it.
 *
 * The figure has been posed from joint angles alone, which means its centre of
 * mass could sit anywhere — a squatter leaning back over his heels, a man
 * holding a barbell out in front and not moving an inch to answer for it.
 * Nobody watching knows the physics, and everybody sees the result: it reads
 * as a puppet held up from outside, because that is exactly what it is.
 *
 * So the combined centre of mass — body AND whatever is being held — is
 * computed from segment masses, and the ankle answers for it. That is the
 * "ankle strategy", the first thing a standing person actually uses: a few
 * degrees of dorsiflexion moves the whole body forward over the feet. Because
 * the foot is planted and the ground solver keeps it planted, adjusting that
 * one angle shifts everything above it and nothing below.
 *
 * The consequence is that the lean now RESPONDS TO THE LOAD. A heavier bar on
 * the back leans him further forward, because it has to.
 */

// Fraction of body mass per segment (Dempster). The bone is taken as the
// segment and its midpoint as the segment's own centre.
const SEGMENT_MASS = [
  ['chest', 0.36], ['spine', 0.14], ['neck', 0.026], ['head', 0.055],
  ['upperarmL', 0.028], ['upperarmR', 0.028],
  ['forearmL', 0.016], ['forearmR', 0.016],
  ['handL', 0.006], ['handR', 0.006],
  ['thighL', 0.100], ['thighR', 0.100],
  ['shinL', 0.0465], ['shinR', 0.0465],
  ['footL', 0.0145], ['footR', 0.0145],
];

export function centreOfMass(bones, load) {
  const acc = new THREE.Vector3();
  let total = 0;
  for (const [name, m] of SEGMENT_MASS) {
    const b = bones[name];
    if (!b) continue;
    // The bone's HEAD, not a midpoint guessed from "the first bone child" —
    // the chest's first child is a collarbone, so half the body's mass was
    // being placed out at the shoulder and the centre of mass came out 17 cm
    // behind the feet. Heads give a consistent centre that still moves
    // correctly with the pose, and the constant offset is absorbed by the
    // neutral-stance baseline.
    acc.addScaledVector(b.getWorldPosition(new THREE.Vector3()), m);
    total += m;
  }
  if (load && load.mass > 0 && load.at) {
    acc.addScaledVector(load.at, load.mass);
    total += load.mass;
  }
  return total > 0 ? acc.divideScalar(total) : acc;
}

// How much of his own bodyweight each thing weighs, so the lean answers to the
// load rather than to nothing. Rough on purpose — the point is that a loaded
// bar on the back moves him and a pair of light dumbbells does not.
export const LOAD_MASS = {
  'barbell-back': 0.95, 'barbell-front': 0.80, 'barbell-hands': 0.70,
  'barbell-floor': 1.10, 'barbell-ez': 0.30, 'trap-bar': 1.10, 'smith-bar': 0.70,
  dumbbells: 0.24, 'dumbbell-single': 0.12,
  'bench-flat': 0.70, 'bench-incline': 0.55, 'bench-thrust': 1.00,
  'lat-pulldown': 0.55, 'cable-high': 0.30, 'cable-mid': 0.30,
  'cable-low': 0.30, 'cable-rope': 0.25,
};

/* ------------------------------ reaching ---------------------------------- */

/* THE HANDS GO WHERE THE BAR IS.
 *
 * Every pose so far has been forward kinematics: name an angle for each joint
 * and see where the hand lands. That is fine when the hand holds nothing, and
 * wrong the moment it holds something whose position is already decided. A back
 * squat is the clearest case — the bar sits on the traps, and the hands must be
 * ON it, out wide, wherever that puts the elbows. Posed by angles, the figure
 * held its hands in front of its chest with the fingers open and the bar
 * floating behind its head, which is what the motion check showed.
 *
 * So: two-link inverse kinematics. Given the shoulder, the target, and the two
 * segment lengths, the law of cosines gives exactly one elbow bend, and the
 * elbow itself is free to swing around the shoulder-to-target line — that
 * freedom is the `pole`, which says where a human would put their elbow.
 *
 * Both bones are then aimed in WORLD space rather than by joint angle. That is
 * deliberate: the sign of an anatomical angle against its rotation has been the
 * single most expensive bug in this rig, silently costing three separate
 * sessions. A direction has no sign to get backwards.
 */

const Y_AXIS = new THREE.Vector3(0, 1, 0);

// Point a bone's own axis along a world direction.
//
// setFromUnitVectors gives the SHORTEST rotation that does that — which leaves
// the roll about the bone's own axis completely undetermined. On an upper arm
// that is not a subtlety: an unpinned roll spins the humerus inside its own
// skin, and the motion check showed each arm smeared into a flat sail from
// shoulder to hand. So aim first, then roll about the bone's axis until its
// hinge lies in the plane the limb is actually bending in.
function aimBone(bone, dir) {
  const parentQ = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  const want = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, dir.clone().normalize());
  bone.quaternion.copy(parentQ.invert().multiply(want));
  bone.updateMatrixWorld(true);
}

function aimWithRoll(bone, dir, planeNormal, hingeAxis) {
  const d = dir.clone().normalize();
  aimBone(bone, d);
  if (!hingeAxis) return;
  const cur = hingeAxis.clone()
    .applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()))
    .projectOnPlane(d);
  const want = planeNormal.clone().projectOnPlane(d);
  if (cur.lengthSq() < 1e-9 || want.lengthSq() < 1e-9) return;
  cur.normalize(); want.normalize();
  let ang = Math.acos(Math.min(1, Math.max(-1, cur.dot(want))));
  if (new THREE.Vector3().crossVectors(cur, want).dot(d) < 0) ang = -ang;
  bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(Y_AXIS, ang));
  bone.updateMatrixWorld(true);
}

/* Put `side`'s hand at `target`, elbow toward `pole`. Returns the angles it
 * actually achieved, in anatomical degrees, so the corrective shapes and the
 * centre of mass see the arm that was drawn rather than the one that was asked
 * for. */
export function reachTo(bones, frames, side, target, pole) {
  const up = bones[`upperarm${side}`];
  const fo = bones[`forearm${side}`];
  const hd = bones[`hand${side}`];
  if (!up || !fo || !hd) return null;

  // segment lengths straight off the rig — a bone's local offset from its
  // parent IS its parent's length, so these cannot drift from the model
  const a = fo.position.length();
  const b = hd.position.length();
  if (!(a > 1e-4 && b > 1e-4)) return null;

  up.parent.updateMatrixWorld(true);
  const S = up.getWorldPosition(new THREE.Vector3());
  const toT = target.clone().sub(S);
  // out of reach is not an error, it is a straight arm: clamp, do not fail
  const d = Math.min(Math.max(toT.length(), Math.abs(a - b) + 1e-3), (a + b) * 0.999);
  if (!(d > 1e-4)) return null;
  toT.normalize();

  const cosE = (a * a + b * b - d * d) / (2 * a * b);
  const elbow = 180 - THREE.MathUtils.radToDeg(Math.acos(Math.min(1, Math.max(-1, cosE))));
  const cosS = (a * a + d * d - b * b) / (2 * a * d);
  const alpha = Math.acos(Math.min(1, Math.max(-1, cosS)));

  // the plane the arm bends in: through the shoulder, the target and the pole
  let n = new THREE.Vector3().crossVectors(toT, pole.clone().sub(S));
  if (n.lengthSq() < 1e-8) n = new THREE.Vector3().crossVectors(toT, Y_AXIS);
  if (n.lengthSq() < 1e-8) return null;
  n.normalize();

  // the elbow and wrist hinges both live in that plane on a real arm, so
  // pinning each bone's own hinge to it is what keeps the limb untwisted
  const elbowHinge = frames?.[`forearm${side}`]?.lateral;
  const wristHinge = frames?.[`hand${side}`]?.lateral;
  const dirE = toT.clone().applyAxisAngle(n, alpha);
  aimWithRoll(up, dirE, n, elbowHinge);
  const E = S.clone().addScaledVector(dirE, a);
  const wrist = S.clone().addScaledVector(toT, d);
  aimWithRoll(fo, wrist.clone().sub(E), n, wristHinge);
  return { elbow, reach: d };
}

/* The closest a hand can come to its own shoulder: a fully folded elbow, and
 * no further. Asking for less than this is what turned a front rack into two
 * stumps — the solver happily folded the arm past the human limit and buried
 * the hand inside the upper arm. */
export function minReach(bones, side, maxFlexDeg = ROM.elbow[1]) {
  const fo = bones[`forearm${side}`]; const hd = bones[`hand${side}`];
  if (!fo || !hd) return 0;
  const a = fo.position.length(); const b = hd.position.length();
  const interior = THREE.MathUtils.degToRad(180 - maxFlexDeg);
  return Math.sqrt(Math.max(0, a * a + b * b - 2 * a * b * Math.cos(interior)));
}

/* Slide a grip outboard along the bar until the shoulder can actually reach it
 * — which is exactly what a lifter does when a rack position is too narrow. */
export function slideOut(shoulder, origin, dir, dmin) {
  const m = origin.clone().sub(shoulder);
  const b = 2 * m.dot(dir);
  const c = m.lengthSq() - dmin * dmin;
  const disc = b * b - 4 * c;
  if (disc <= 0) return null;
  return origin.clone().addScaledVector(dir, (-b + Math.sqrt(disc)) / 2);
}

/* Where the hands go on a bar that is already placed: `out` metres either side
 * of its centre, along the bar itself. */
export function barGrip(barCentre, barAxis, out) {
  const ax = barAxis.clone().normalize();
  return {
    L: barCentre.clone().addScaledVector(ax, -out),
    R: barCentre.clone().addScaledVector(ax, out),
  };
}

/* WHICH WAY THE BODY IS FACING, from the body.
 *
 * `fwd` elsewhere in this rig is the direction a TOE points, which is a
 * different thing: a squat stance is toed out, so it sits about thirty degrees
 * off the midline, and it turned out to disagree with the chest's own forward
 * by more than a right angle. The older solvers are tuned around that and are
 * left alone; anything new asks the torso instead. The chest's rest frame
 * carries the body's anterior, so rotating it by the chest's parent gives a
 * forward that follows the figure wherever it leans.
 */
export function bodyAnterior(bones, frames) {
  const chest = bones.chest;
  const f = frames?.chest?.anterior;
  if (!chest || !f || !chest.parent) return null;
  const v = f.clone()
    .applyQuaternion(chest.parent.getWorldQuaternion(new THREE.Quaternion()));
  v.y = 0;
  return v.lengthSq() > 1e-8 ? v.normalize() : null;
}

/* THE EYES HOLD THE HORIZON, measured rather than guessed.
 *
 * Call this after the trunk has been settled and balanced: the pose's spine
 * angle is only part of the story, because balance() leans the whole body to
 * sit under the load. Estimating the compensation from the pose alone left the
 * figure looking at the ceiling through an entire front squat.
 */
export function levelGaze(bones, frames, keep = 0.55) {
  const chest = bones.chest; const neck = bones.neck;
  if (!chest || !neck || !frames?.neck) return 0;
  const axis = new THREE.Vector3(0, 1, 0)
    .applyQuaternion(chest.getWorldQuaternion(new THREE.Quaternion()));
  const ant = bodyAnterior(bones, frames);
  if (!ant) return 0;
  // signed: positive when the chest is pitched forward
  const pitch = THREE.MathUtils.radToDeg(
    Math.asin(Math.min(1, Math.max(-1, axis.dot(ant)))));
  const give = clampTo(pitch * keep, [-42, 42]);
  const turn = (name, deg) => {
    const b = bones[name]; const f = frames[name];
    if (!b || !f || !deg) return;
    b.quaternion.premultiply(
      new THREE.Quaternion().setFromAxisAngle(f.lateral, D(deg)));
    b.updateMatrixWorld(true);
  };
  // NEGATIVE: the neck GIVES BACK the trunk's pitch, it does not add to it.
  // Measured with the trunk folded to 67 degrees, the neck was reaching 90 and
  // the head 104 — his face pointing at his own shins. Fifth time this rig has
  // met the same sign trap; found by measurement again, never by looking.
  turn('neck', -give * 0.62);
  turn('head', -give * 0.38);
  return pitch;
}

/* AN ARM THAT IS ONLY CARRYING SOMETHING HANGS PLUMB.
 *
 * Shoulder angles are measured against the TRUNK, which is the right way to
 * describe a press. It is the wrong way to describe a deadlift: pitch the
 * trunk to 52 degrees and an arm posed at "0" swings out in front of him,
 * because it is faithfully staying 0 degrees from a chest that is no longer
 * upright. Gravity does not care about the chest. So whenever the shoulder is
 * not actually doing anything — no flexion, no abduction — the humerus is
 * aimed straight down and the elbow keeps whatever the pose gave it.
 *
 * That is also true of a curl, where the humerus stays vertical and only the
 * forearm moves, and of a shrug, and of anything carried at the side.
 */
export function plumbUpperArm(bones, frames, side, pose, gate = 15) {
  const up = bones[`upperarm${side}`];
  if (!up || !pose) return false;
  if (Math.abs(pose.shoulder || 0) > gate) return false;
  if (Math.abs(pose.shoulderAbduct || 0) > gate) return false;
  const lat = frames?.[`forearm${side}`]?.lateral;
  aimWithRoll(up, new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0), lat);
  return true;
}
