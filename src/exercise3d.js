// HOW EACH LIFT ACTUALLY MOVES — joint angles, not CSS transforms.
//
// The old data (`exerciseMotion.js`) described movement as 2D transform
// strings for the flat figure: a squat was `scaleY(0.86)` on the legs, so the
// 3D figure SHRANK its legs instead of flexing hips and knees. Hayden's
// verdict, 8 Sep 2026: "most of the exercises... completely wrong with how the
// movement is actually meant to be carried out". He was right.
//
// This file states each pattern the way a biomechanist would: the angle every
// joint passes through, in degrees, from the start of the rep to the end.
// Ranges are the ones a competent lifter actually uses — squat depth is hip
// crease below knee (~100° hip, ~120° knee), a strict curl is ~145° of elbow
// flexion, a bench press touches at ~75° of shoulder horizontal adduction.
// They are stated once, per PATTERN, because 135 lifts share about twenty
// shapes; a per-exercise override exists for the lifts whose shape genuinely
// differs (incline vs flat, sumo vs conventional).
//
// Sign convention, in the model's own frame:
//   flexion of a limb that swings FORWARD is positive about X
//   abduction away from the midline is positive about Z (mirrored per side)
//   rotation about the limb's own long axis is Y
// The renderer maps these to bone-local rotations once, in one place.

export const JOINTS = ['spine', 'chest', 'neck', 'shoulder', 'elbow', 'hip', 'knee', 'ankle'];

// Every pattern: the pose at the START of the rep and at the END (the working
// position). The renderer eases between them, so one entry is a whole rep.
export const PATTERNS = {
  squat: {
    label: 'Squat — hip and knee flexion under load',
    equipment: 'barbell-back',
    cue: 'Hip crease below the knee, bar over midfoot, chest up.',
    start: { hip: 0, knee: 0, ankle: 0, spine: 5, shoulder: 15, elbow: 95 },
    end: { hip: -100, knee: 120, ankle: 25, spine: 22, shoulder: 15, elbow: 95 },
  },
  'front-squat': {
    label: 'Front squat — the same descent, a more upright torso',
    equipment: 'barbell-front',
    cue: 'Elbows high, torso vertical, the bar rides the front delts.',
    start: { hip: 0, knee: 0, ankle: 0, spine: 2, shoulder: 85, elbow: 130 },
    end: { hip: -105, knee: 125, ankle: 28, spine: 10, shoulder: 85, elbow: 130 },
  },
  hinge: {
    label: 'Hip hinge — the hips travel back, the spine holds',
    equipment: 'barbell-hands',
    cue: 'Push the hips back, soft knees, bar against the legs.',
    start: { hip: 0, knee: 5, ankle: 0, spine: 3, shoulder: 0, elbow: 5 },
    end: { hip: -95, knee: 20, ankle: 5, spine: 8, shoulder: 0, elbow: 5 },
  },
  deadlift: {
    label: 'Deadlift — hips and knees extend together from the floor',
    equipment: 'barbell-floor',
    cue: 'Hips set, lats tight, the bar leaves the floor over midfoot.',
    // Set against Zac Perna's side-view demo rather than against my own idea
    // of it: a deadlift SETUP is a hinge with the hips high, not a squat with
    // a bar in front. 118 degrees of knee put his hips at 0.58 — squat depth —
    // where the reference has them well above the knees with the trunk pitched
    // around fifty. Knee down, hip flexion up; the hands stay at the bar
    // because the trunk carries them there instead of the depth.
    start: { hip: -131, knee: 99, ankle: 18, spine: -18, shoulder: -4, elbow: 3 },
    end: { hip: 0, knee: 0, ankle: 0, spine: 2, shoulder: 0, elbow: 3 },
  },
  'press-horizontal': {
    label: 'Horizontal press — the elbow drives the load away from the chest',
    stance: 'supine',
    equipment: 'bench-flat',
    lying: true,
    cue: 'Shoulder blades set, bar to the sternum, elbows ~60° from the torso.',
    // At the BOTTOM the upper arm is out to the side and roughly horizontal,
    // with the forearm vertical under the bar — that is what a bench press
    // looks like. Written with the arm nearly overhead and the elbow folded,
    // it read as an overhead triceps extension, which is what it was.
    // Bar to the CHEST, checked against side-view footage: the reference
    // touches the sternum and the elbows drop below the line of the torso.
    // At 94 degrees of elbow the bar stopped 10 cm short — wrist 0.800 against
    // a chest surface at 0.617 — which is a press that never finishes its
    // eccentric, the half of the rep the chest is actually built in.
    start: { shoulder: 52, shoulderAbduct: 68, elbow: 122, hip: -8, knee: 76, ankle: 0 },
    end: { shoulder: 90, shoulderAbduct: 14, elbow: 4, hip: -8, knee: 76, ankle: 0 },
  },
  'press-incline': {
    label: 'Incline press — the same press on a 30° bench',
    stance: 'incline30',
    equipment: 'bench-incline',
    lying: true,
    cue: 'Bench at 30°, bar to the upper chest just below the collarbone.',
    start: { shoulder: 56, shoulderAbduct: 58, elbow: 92, hip: -14, knee: 74, ankle: 0 },
    end: { shoulder: 88, shoulderAbduct: 16, elbow: 4, hip: -14, knee: 74, ankle: 0 },
  },
  'press-overhead': {
    label: 'Overhead press — shoulder flexion to lockout',
    equipment: 'barbell-hands',
    cue: 'Bar from the front delts to over the midfoot; head moves back, then through.',
    start: { shoulder: 10, elbow: 130, spine: 4 },
    end: { shoulder: 170, elbow: 5, spine: 0 },
  },
  pulldown: {
    stance: 'seated',
    label: 'Vertical pull — the elbow drives down and back',
    equipment: 'lat-pulldown',
    cue: 'Chest up, drive the elbows to the ribs, no swing.',
    start: { shoulder: 155, elbow: 10, spine: 4, hip: -88, knee: 82, ankle: 0 },
    end: { shoulder: 35, elbow: 105, spine: 10, hip: -88, knee: 82, ankle: 0 },
  },
  'pull-up': {
    label: 'Pull-up — the body rises to the bar',
    stance: 'hanging',
    equipment: 'pullup-bar',
    hanging: true,
    cue: 'Full hang to chin over the bar, ribs down.',
    // A PULL-UP IS NOT A VERTICAL SLIDE. Checked against TylerPath's side-on
    // demo: the chest travels toward the bar, so the trunk leans BACK through
    // the pull and the knees fold behind — mine stayed bolt upright at 0.8
    // degrees from top to bottom, which is a man being winched.
    start: { shoulder: 170, elbow: 5, hip: 4, knee: 26, spine: 2 },
    end: { shoulder: 42, elbow: 142, hip: -6, knee: 48, spine: 18 },
  },
  row: {
    label: 'Horizontal pull — the elbow drives past the ribs',
    equipment: 'cable-mid',
    cue: 'Torso still, pull to the navel, shoulder blades finish the rep.',
    start: { shoulder: 45, elbow: 15, spine: 6 },
    end: { shoulder: -25, elbow: 115, spine: 3 },
  },
  'row-bent': {
    label: 'Bent-over row — hinged, the pull is to the lower ribs',
    equipment: 'barbell-hands',
    cue: 'Hinged ~60°, back flat, the bar comes to the navel.',
    start: { hip: -70, knee: 20, spine: 6, shoulder: 60, elbow: 10 },
    end: { hip: -70, knee: 20, spine: 6, shoulder: 10, elbow: 110 },
  },
  curl: {
    label: 'Elbow flexion',
    equipment: 'dumbbells',
    cue: 'Elbows pinned to the ribs; the forearm is the only thing that moves.',
    start: { elbow: 5, shoulder: 0 },
    end: { elbow: 145, shoulder: 8 },
  },
  pushdown: {
    label: 'Elbow extension',
    equipment: 'cable-high',
    cue: 'Upper arm still, elbows locked to the sides.',
    start: { elbow: 100, shoulder: -5 },
    end: { elbow: 5, shoulder: -5 },
  },
  'overhead-extension': {
    label: 'Overhead elbow extension',
    equipment: 'dumbbell-single',
    cue: 'Upper arms vertical beside the ears, only the elbow moves.',
    start: { shoulder: 165, elbow: 130 },
    end: { shoulder: 165, elbow: 10 },
  },
  fly: {
    label: 'Shoulder horizontal adduction',
    stance: 'supine',
    // on a BENCH, not the floor — with 'dumbbells' the renderer had nothing to
    // lay him on and put him on the ground with his knees up
    equipment: 'bench-flat-db',
    lying: true,
    cue: 'A soft, fixed elbow angle; the arc is at the shoulder.',
    start: { shoulder: 88, shoulderAbduct: 82, elbow: 24, hip: -8, knee: 76, ankle: 0 },
    end: { shoulder: 90, shoulderAbduct: 10, elbow: 18, hip: -8, knee: 76, ankle: 0 },
  },
  'raise-lateral': {
    label: 'Shoulder abduction',
    equipment: 'dumbbells',
    cue: 'Lead with the elbow to shoulder height; no shrug at the top.',
    start: { shoulderAbduct: 8, elbow: 12 },
    end: { shoulderAbduct: 88, elbow: 12 },
  },
  'raise-front': {
    label: 'Shoulder flexion',
    equipment: 'dumbbells',
    cue: 'Straight arm to eye level, ribs down.',
    start: { shoulder: 5, elbow: 8 },
    end: { shoulder: 95, elbow: 8 },
  },
  shrug: {
    label: 'Scapular elevation',
    equipment: 'dumbbells',
    cue: 'Straight up, no roll; the arms are hooks.',
    start: { shoulderShrug: 0, elbow: 5 },
    end: { shoulderShrug: 1, elbow: 5 },
  },
  'leg-curl': {
    label: 'Knee flexion',
    stance: 'prone',
    equipment: 'machine-legcurl',
    prone: true,
    cue: 'Hips down, heels to the glutes.',
    start: { knee: 5, hip: 0 },
    end: { knee: 110, hip: 0 },
  },
  'leg-extension': {
    label: 'Knee extension',
    stance: 'seated',
    equipment: 'machine-legext',
    seated: true,
    cue: 'Sit tall, extend to straight without slamming the joint.',
    start: { knee: 95, hip: -85 },
    end: { knee: 5, hip: -85 },
  },
  'leg-press': {
    label: 'Leg press — hip and knee flexion on a sled',
    stance: 'seated-back',
    equipment: 'machine-legpress',
    seated: true,
    cue: 'Knees track the toes; stop before the lower back rounds.',
    start: { knee: 20, hip: -75 },
    end: { knee: 100, hip: -115 },
  },
  lunge: {
    label: 'Split squat — one leg forward, one behind',
    equipment: 'dumbbells',
    split: true,
    cue: 'Front shin vertical, back knee under the hip.',
    start: { hip: 0, knee: 5, hipBack: 0, kneeBack: 5, spine: 4 },
    end: { hip: -85, knee: 95, hipBack: 15, kneeBack: 105, spine: 6 },
  },
  'hip-thrust': {
    label: 'Hip extension against a bench',
    stance: 'thrust',
    equipment: 'bench-thrust',
    cue: 'Ribs down, chin tucked, finish with the glutes not the back.',
    start: { hipTilt: -38, hip: -34, knee: 88, spine: 2 },
    end: { hipTilt: 4, hip: 2, knee: 88, spine: 2 },
  },
  'calf-raise': {
    label: 'Ankle plantarflexion',
    equipment: 'none',
    cue: 'Full stretch at the bottom, pause at the top.',
    start: { ankle: 0, knee: 2 },
    end: { ankle: -34, knee: 2 },
  },
  crunch: {
    label: 'Spinal flexion',
    stance: 'supine',
    equipment: 'none',
    lying: true,
    cue: 'Ribs toward the hips; the neck does not lead.',
    start: { spine: 0, chest: 0, hip: -85, knee: 85 },
    end: { spine: 28, chest: 18, hip: -85, knee: 85 },
  },
  'hanging-knee-raise': {
    label: 'Hip flexion from a hang',
    stance: 'hanging',
    equipment: 'pullup-bar',
    hanging: true,
    cue: 'Curl the pelvis; do not just swing the legs.',
    start: { hip: 0, knee: 15, shoulder: 170, elbow: 5, spine: 0 },
    end: { hip: -95, knee: 90, shoulder: 170, elbow: 5, spine: 15 },
  },
};

// Which pattern a lift uses. FIRST match wins, so the specific rules come
// before the general — "incline bench press" must be tested before "press".
const RULES = [
  [/\bfront squat\b/i, 'front-squat'],
  [/\bhack squat\b|\bleg press\b/i, 'leg-press'],
  [/\bsplit squat\b|\blunge\b|\bstep[- ]?up\b/i, 'lunge'],
  [/\bsquat\b/i, 'squat'],
  [/\bhip thrust\b|\bglute bridge\b/i, 'hip-thrust'],
  [/\bromanian\b|\brdl\b|\bstiff[- ]?leg|\bgood morning\b|\bhyperextension\b/i, 'hinge'],
  [/\bdeadlift\b/i, 'deadlift'],
  [/\bleg curl\b|\bhamstring curl\b/i, 'leg-curl'],
  [/\bleg extension\b/i, 'leg-extension'],
  [/\bcalf\b|\bcalve\b/i, 'calf-raise'],
  [/\bpull[- ]?up\b|\bchin[- ]?up\b/i, 'pull-up'],
  [/\bknee raise\b|\bleg raise\b|\bhanging\b/i, 'hanging-knee-raise'],
  [/\bpulldown\b|\bpull[- ]?down\b/i, 'pulldown'],
  [/\bbent[- ]?over row\b|\bbarbell row\b|\bpendlay\b/i, 'row-bent'],
  [/\brow\b/i, 'row'],
  [/\bincline\b[^\n]*\b(press|bench)\b|\bbench\b[^\n]*\bincline\b/i, 'press-incline'],
  [/\b(bench|chest) press\b|\bfloor press\b|\bpush[- ]?up\b|\bdip\b/i, 'press-horizontal'],
  [/\boverhead press\b|\bshoulder press\b|\bmilitary\b|\bpush press\b|\barnold\b/i, 'press-overhead'],
  [/\bfly\b|\bflye\b|\bpec dec\b|\bcross[- ]?over\b/i, 'fly'],
  [/\blateral raise\b|\bside raise\b|\blat raise\b/i, 'raise-lateral'],
  [/\bfront raise\b/i, 'raise-front'],
  [/\bshrug\b/i, 'shrug'],
  [/\bskull ?crusher\b|\boverhead (tricep|extension)|\btricep extension\b/i, 'overhead-extension'],
  [/\bpushdown\b|\bpress[- ]?down\b|\bkickback\b/i, 'pushdown'],
  [/\bcurl\b/i, 'curl'],
  [/\bcrunch\b|\bsit[- ]?up\b|\bab wheel\b|\bplank\b/i, 'crunch'],
];

export function patternFor(name = '') {
  const n = String(name || '');
  for (const [re, id] of RULES) if (re.test(n)) return id;
  return null;
}

// Equipment a pattern implies, unless the exercise's own name says otherwise —
// "dumbbell bench press" is a horizontal press holding dumbbells, and showing
// a barbell there would be teaching the wrong thing.
export function equipmentFor(name = '', pattern = null) {
  const n = String(name || '').toLowerCase();
  const base = pattern && PATTERNS[pattern] ? PATTERNS[pattern].equipment : 'none';
  if (/\bdumbbell\b|\bdb\b/.test(n)) {
    if (base.startsWith('bench')) return base === 'bench-incline' ? 'bench-incline-db' : 'bench-flat-db';
    if (base.startsWith('barbell')) return 'dumbbells';
    return base === 'none' ? 'dumbbells' : base;
  }
  if (/\blat[- ]?pull ?down\b|\bpull ?down\b/.test(n)) return 'lat-pulldown';
  if (/\bez[- ]?bar\b|\bpreacher\b/.test(n)) return 'barbell-ez';
  if (/\btrap[- ]?bar\b|\bhex[- ]?bar\b/.test(n)) return 'trap-bar';
  if (/\bsmith\b/.test(n)) return 'smith-bar';
  if (/\brope\b/.test(n)) return 'cable-rope';
  if (/\bcable\b/.test(n)) {
    // where the cable LEAVES the machine is the whole shape of the exercise:
    // a pushdown comes from above, a curl and a kickback from the floor
    if (/pull ?down|pushdown|push ?down|overhead|face ?pull|crossover/.test(n)) return 'cable-high';
    if (/curl|kick ?back|lateral|side|shrug|row|pull ?through|abduction/.test(n)) return 'cable-low';
    return 'cable-mid';
  }
  if (/\bmachine\b/.test(n) && base.startsWith('barbell')) return base;
  if (/\bbodyweight\b|\bpush[- ]?up\b/.test(n)) return 'none';
  return base;
}

// A hand holding a bar is doing three things the joint table never said: the
// forearm is rolled to face the palms the right way, the wrist is set, and the
// fingers are closed round it. Rather than repeat that on every one of the
// twenty-six patterns, it is derived — a lift that holds something grips it,
// pronated unless the lift is a curl or a chin-up, which are supinated.
const SUPINATED = /curl|chin|underhand|supinat/;
const NEUTRAL = /hammer|neutral|rope|farmer|trap|shrug/;

// Which SHAPE the hand makes, not just how far it closes. A hook grip, a
// thumbless press, a rope, a machine handle and a hang are five different
// hands, and closing all five digits from one number made them one.
function gripStyle(id, holds) {
  if (/hook/.test(id)) return 'hook';
  if (/rope/.test(id)) return 'rope';
  if (/deadlift|barbell-floor|trap-bar/.test(id)) return 'hook';
  if (/thumbless|false grip/.test(id)) return 'thumbless';
  if (/pull ?-?up|chin|hang/.test(id)) return 'hang';
  if (!holds || /^machine-|push ?-?up|bodyweight/.test(id)) return 'open';
  return 'full';
}

export function gripFor(pattern, equipment = '') {
  const p = PATTERNS[pattern] || {};
  const holds = equipment && equipment !== 'none' && !/^machine-/.test(equipment);
  const id = `${pattern} ${p.equipment || ''} ${equipment}`;
  return {
    gripStyle: p.gripStyle || gripStyle(id, holds),
    grip: p.grip != null ? p.grip : (holds ? 1 : 0.18),
    // + rolls the palm to face down/away, which is how almost everything is
    // held; a curl and a chin-up are the exceptions
    forearmTwist: p.forearmTwist != null ? p.forearmTwist
      : (SUPINATED.test(id) ? -62 : NEUTRAL.test(id) ? -14 : 58),
    // the bar sits in the heel of the palm, so a loaded wrist is slightly
    // extended, never bent forward
    wrist: p.wrist != null ? p.wrist : (holds ? -12 : 0),
  };
}

/* THE POSE AT A POINT IN THE REP.
 *
 * A rep is not a smooth interpolation between a top and a bottom. It has a
 * shape: a controlled descent, a turnaround, a hard patch where the leverage
 * is worst and the bar barely moves, then an easier finish. Two keyframes
 * eased between give a bar path no lifter has ever produced — it accelerates
 * out of the hole and decelerates into lockout, which is exactly backwards.
 *
 * So a pattern may give `keys`: four to six poses along the rep, each with the
 * time `at` it happens. The STICKING POINT is expressed the way it actually
 * looks — two keys close together in pose and far apart in time, so the figure
 * hangs there. Patterns that still give only `start`/`end` are read as a
 * two-key rep, so nothing breaks while they are converted.
 */
function lerpPose(a, b, t) {
  const out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (k === 'at') continue;
    const x = a[k] ?? 0; const y = b[k] ?? 0;
    if (typeof x === 'number' && typeof y === 'number') out[k] = x + (y - x) * t;
  }
  return out;
}

/* THE SHAPE OF A REP, as a path through the range rather than a smooth ease.
 *
 * `progress` is how far the lift has travelled from `start` toward `end`; the
 * pairs below say how much of it has happened by each moment. Both profiles
 * bunch their middle keys around the STICKING POINT — the patch where the
 * leverage is worst, where a real bar slows almost to nothing and then speeds
 * up once past it. Read them as [phase, progress].
 *
 * Which profile a lift uses depends on which half of its cycle is the hard
 * one: a squat lowers first and grinds on the way up, a bench press starts on
 * the chest and grinds a hand's width off it.
 */
const REP_ECCENTRIC_FIRST = [
  [0, 0], [0.14, 0.28], [0.28, 0.68], [0.44, 1], [0.54, 0.94],
  [0.66, 0.80], [0.76, 0.66], [0.88, 0.28], [1, 0],
];
const REP_CONCENTRIC_FIRST = [
  [0, 0], [0.10, 0.10], [0.22, 0.24], [0.32, 0.38], [0.42, 0.74], [0.5, 1],
  [0.62, 0.90], [0.76, 0.58], [0.9, 0.20], [1, 0],
];
// lifts whose START is the bottom of the rep, so the drive comes first
const DRIVE_FIRST = new Set([
  'deadlift', 'press-horizontal', 'press-incline', 'press-overhead', 'pulldown',
  'pull-up', 'row', 'row-bent', 'curl', 'pushdown', 'overhead-extension', 'fly',
  'raise-lateral', 'raise-front', 'shrug', 'leg-curl', 'leg-extension',
  'hip-thrust', 'calf-raise', 'crunch', 'hanging-knee-raise',
]);

export function keyframes(pattern) {
  const p = PATTERNS[pattern];
  if (!p) return null;
  if (p.keys && p.keys.length >= 2) return p.keys;
  const shape = p.shape
    || (DRIVE_FIRST.has(pattern) ? REP_CONCENTRIC_FIRST : REP_ECCENTRIC_FIRST);
  return shape.map(([at, u]) => ({ at, ...lerpPose(p.start, p.end, u) }));
}

export function poseAt(pattern, phase) {
  const keys = keyframes(pattern);
  if (!keys) return null;
  const t = ((phase % 1) + 1) % 1;
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].at <= t) i += 1;
  const a = keys[i]; const b = keys[i + 1];
  const span = Math.max(1e-6, (b.at ?? 1) - (a.at ?? 0));
  const u = Math.max(0, Math.min(1, (t - (a.at ?? 0)) / span));
  // eased within each leg, so the turnarounds are smooth and the middle of a
  // leg moves at speed — a rep is not one long ease
  return lerpPose(a, b, u * u * (3 - 2 * u));
}

/* A SET IS NOT ONE REP REPEATED.
 *
 * The figure has always looped a single perfect rep, which is the one thing in
 * it that no body does. A real last rep is slower than the first, shallower by
 * a few degrees at both ends, and it shakes where the leverage is worst — and
 * a lifter reading a demonstration knows that difference on sight, because it
 * is what their own eighth rep felt like.
 *
 * It is also the only part of this figure that can carry INFORMATION rather
 * than polish: driven from the RPE he logged, the same lift demonstrates
 * differently for a set he left three in the tank on and a set he emptied.
 *
 * Numbers chosen to be conservative, and then halved after measuring. Giving
 * each joint a tenth of its range back sounds modest and is not: the closed
 * chain amplifies it, and a squat came out 8.7 cm shallower on the last rep —
 * a fifth of its whole travel. Measured again at half that it loses about 4 cm
 * of depth, which is what a hard eighth rep actually looks like.
 */
export const REP_SECONDS = 3.4;

export function fatigueAt(rep, reps, rpe = 8) {
  if (!reps || reps < 2) return 0;
  // effort decides how much of the set is spent tired: at RPE 10 the last rep
  // is a grind, at RPE 6 he never gets there
  const ceiling = Math.max(0, Math.min(1, (rpe - 5) / 5));
  const through = Math.max(0, Math.min(1, rep / (reps - 1)));
  return ceiling * through * through;      // the cost is not linear; it bites late
}

/* What fatigue does to a rep: less range, and a tremor where it is hardest. */
export function tire(pose, pattern, f, phase) {
  if (!f) return pose;
  const p = PATTERNS[pattern];
  if (!p || !p.start) return pose;
  const out = { ...pose };
  // ROM first. Every channel gives a little back toward where the rep began —
  // the lockout is not quite reached and the bottom is not quite made.
  for (const k of Object.keys(out)) {
    if (typeof out[k] !== 'number' || typeof p.start[k] !== 'number') continue;
    out[k] = out[k] + (p.start[k] - out[k]) * 0.055 * f;
  }
  // ...and the shake, only through the drive and only where the leverage is
  // worst. A tremor at the top of a rep is not fatigue, it is a bad rig.
  const grind = Math.max(0, Math.sin(Math.PI * Math.min(1, phase * 2))) ** 2;
  const amp = 1.5 * f * grind;
  if (amp > 0.02) {
    const t = phase * 61.0;
    for (const k of ['hip', 'knee', 'elbow', 'shoulder', 'spine']) {
      if (typeof out[k] === 'number') out[k] += Math.sin(t + k.length) * amp;
    }
  }
  return out;
}
